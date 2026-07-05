import type Stripe from "stripe";

/**
 * settle時にConnectアカウント未オンボーディングでTransferできなかった分配を
 * pending_connect_transfers にキューイングする。
 *
 * ここでは「キューに積む」だけで例外を投げない（settle本体の処理を止めないため）。
 */
export async function queuePendingTransfer(
  admin: any,
  params: {
    eventId: string;
    profileId: string;
    txId?: string | null;
    role: string;
    amount: number;
    chargeId?: string | null;
    reason: string;
  },
): Promise<void> {
  const { error } = await admin.from("pending_connect_transfers").insert({
    event_id: params.eventId,
    profile_id: params.profileId,
    tx_id: params.txId ?? null,
    role: params.role,
    amount: params.amount,
    charge_id: params.chargeId ?? null,
    status: "pending",
    last_error: params.reason,
  });
  if (error) {
    console.error(`[pending-transfers] queue失敗 profile=${params.profileId} amount=${params.amount}:`, error.message);
  }
}

/**
 * 指定プロフィールの pending な Transfer を全件リトライする。
 * Connectアカウントのオンボーディングが完了した直後（webhook）や
 * セーフティネットcronから呼ばれる。
 */
export async function retryPendingTransfersForProfile(
  admin: any,
  stripe: Stripe,
  profileId: string,
): Promise<{ attempted: number; succeeded: number; succeededAmount: number; failedAmount: number }> {
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_connect_id")
    .eq("profile_id", profileId)
    .single();

  const connectId = profile?.stripe_connect_id ?? null;
  if (!connectId) return { attempted: 0, succeeded: 0, succeededAmount: 0, failedAmount: 0 };

  const { data: pendingRows } = await admin
    .from("pending_connect_transfers")
    .select("pending_transfer_id, event_id, amount, charge_id, attempt_count")
    .eq("profile_id", profileId)
    .eq("status", "pending");

  const rows = pendingRows ?? [];
  let succeeded = 0;
  let succeededAmount = 0;
  let failedAmount = 0;

  for (const row of rows) {
    try {
      const transfer = await stripe.transfers.create({
        amount: row.amount,
        currency: "jpy",
        destination: connectId,
        ...(row.charge_id ? { source_transaction: row.charge_id } : {}),
        metadata: {
          event_id: row.event_id,
          profile_id: profileId,
          pending_transfer_id: row.pending_transfer_id,
        },
      });

      await admin.from("settle_transfers").insert({
        event_id: row.event_id,
        profile_id: profileId,
        stripe_transfer_id: transfer.id,
        amount: row.amount,
      });

      await admin
        .from("pending_connect_transfers")
        .update({
          status: "transferred",
          stripe_transfer_id: transfer.id,
          resolved_at: new Date().toISOString(),
          attempt_count: (row.attempt_count ?? 0) + 1,
        })
        .eq("pending_transfer_id", row.pending_transfer_id);

      succeeded++;
      succeededAmount += row.amount;
    } catch (err: any) {
      console.error(`[pending-transfers] retry失敗 profile=${profileId} pending_transfer_id=${row.pending_transfer_id}:`, err.message);
      await admin
        .from("pending_connect_transfers")
        .update({
          last_error: err.message,
          attempt_count: (row.attempt_count ?? 0) + 1,
        })
        .eq("pending_transfer_id", row.pending_transfer_id);
      failedAmount += row.amount;
    }
  }

  return { attempted: rows.length, succeeded, succeededAmount, failedAmount };
}
