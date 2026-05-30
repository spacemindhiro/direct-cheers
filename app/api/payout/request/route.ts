import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const TRANSFER_FEE = 500; // 振込手数料 ¥500
const HOLD_DAYS = 14;     // 出金可能になるまでの日数

// 複数 transfer から targetAmount 分を Reversal してプラットフォームに回収
const collectFeeByReversal = async (
  transferIds: string[],
  targetAmount: number,
): Promise<number> => {
  let remaining = targetAmount;
  for (const transferId of transferIds) {
    if (remaining <= 0) break;
    try {
      const tr = await stripe.transfers.retrieve(transferId);
      const reversible = tr.amount - tr.amount_reversed;
      if (reversible <= 0) continue;
      const toReverse = Math.min(reversible, remaining);
      await stripe.transfers.createReversal(transferId, { amount: toReverse });
      remaining -= toReverse;
    } catch (err: any) {
      console.error(`[payout/request] reversal失敗 transfer=${transferId}:`, err.message);
    }
  }
  return targetAmount - remaining;
};

// 複数 transfer から targetAmount 分を Reversal してプラットフォームに回収

export async function POST(req: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, balance_frozen, stripe_connect_id")
    .eq("profile_id", user.id)
    .single();

  if (profile?.balance_frozen)
    return NextResponse.json({ error: "残高が凍結されています" }, { status: 403 });

  if (!profile?.stripe_connect_id)
    return NextResponse.json({ error: "Stripe Connectアカウントが未設定です" }, { status: 400 });

  const { requested_amount, bypass_event_id } = await req.json() as { requested_amount: number; bypass_event_id?: string };

  if (!requested_amount || requested_amount <= TRANSFER_FEE)
    return NextResponse.json(
      { error: `出金額は振込手数料 ¥${TRANSFER_FEE} より大きくしてください` },
      { status: 400 }
    );

  const isAdmin = profile?.role === "admin";
  const useBypass = !!bypass_event_id && isAdmin;

  const cutoff = new Date(Date.now() - HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: availableDists } = await admin
    .from("transaction_distributions")
    .select(`
      transaction_distribution_id,
      actual_amount,
      event_id,
      hold_released,
      transaction:transactions!transaction_id(
        transaction_id,
        created_at,
        reconciled_at,
        amount_verified,
        amount_mismatch
      )
    `)
    .eq("profile_id", user.id)
    .eq("distribution_status", "accrued")
    .eq("is_frozen", false)
    .is("deleted_at", null);

  const eligibleDists = (availableDists ?? []).filter((d) => {
    const tx = d.transaction as any;
    if (!tx) return false;
    const skipHold = (d as any).hold_released || (useBypass && (d as any).event_id === bypass_event_id);
    if (!skipHold && (!tx.created_at || tx.created_at >= cutoff)) return false;
    if (!tx.reconciled_at) return false;
    if (tx.amount_verified === false || (tx.amount_mismatch ?? 0) !== 0) return false;
    return true;
  });

  const unreconciledCount = (availableDists ?? []).filter((d) => {
    const tx = d.transaction as any;
    if ((d as any).hold_released) return false;
    if (useBypass && (d as any).event_id === bypass_event_id) return false;
    return tx?.created_at && tx.created_at < cutoff && !tx.reconciled_at;
  }).length;

  if (unreconciledCount > 0) {
    return NextResponse.json(
      { error: `照合が完了していないトランザクションが ${unreconciledCount} 件あります。翌日以降に再度お試しください。` },
      { status: 400 }
    );
  }

  const availableTotal = eligibleDists.reduce((s, d) => s + (d.actual_amount ?? 0), 0);

  if (requested_amount > availableTotal)
    return NextResponse.json(
      { error: `出金可能額（¥${availableTotal.toLocaleString()}）を超えています` },
      { status: 400 }
    );

  const netPayout = requested_amount - TRANSFER_FEE;

  // Stripe payout（Connect アカウント → 銀行口座）
  let stripeTransferId: string | null = null;
  try {
    const payout = await stripe.payouts.create(
      { amount: netPayout, currency: "jpy" },
      { stripeAccount: profile.stripe_connect_id }
    );
    stripeTransferId = payout.id;
  } catch (err: any) {
    return NextResponse.json({ error: `Stripe payout 失敗: ${err.message}` }, { status: 500 });
  }

  // 振込手数料をプラットフォームへ回収（全ロール共通: settle_transfers の Transfer を Reversal）
  // source_transaction Transfer も通常の Transfer も同じ Reversal API で回収できる。
  const payoutEventIds = [...new Set(
    (eligibleDists as any[]).map((d: any) => d.event_id).filter(Boolean) as string[]
  )];

  try {
    const { data: trs } = await admin
      .from("settle_transfers")
      .select("stripe_transfer_id")
      .eq("profile_id", user.id)
      .in("event_id", payoutEventIds)
      .order("created_at", { ascending: false });
    const ids = (trs ?? []).map((t) => t.stripe_transfer_id);
    await collectFeeByReversal(ids, TRANSFER_FEE);
  } catch (err: any) {
    console.error("[payout/request] 振込手数料回収失敗:", err.message);
  }

  // payout_requests を作成
  const { data: payoutReq, error: prErr } = await admin
    .from("payout_requests")
    .insert({
      profile_id: user.id,
      requested_amount,
      stripe_fee_deducted: TRANSFER_FEE,
      net_payout_amount: netPayout,
      status: "completed",
      stripe_transfer_id: stripeTransferId,
    })
    .select("request_id")
    .single();

  if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });

  // 使用した distributions を paid に更新
  let remaining = requested_amount;
  const toMarkPaid: string[] = [];
  const sorted = [...eligibleDists].sort((a, b) =>
    ((a.transaction as any)?.created_at ?? "") < ((b.transaction as any)?.created_at ?? "") ? -1 : 1
  );
  for (const d of sorted) {
    if (remaining <= 0) break;
    toMarkPaid.push(d.transaction_distribution_id);
    remaining -= d.actual_amount ?? 0;
  }

  await admin
    .from("transaction_distributions")
    .update({ distribution_status: "paid" })
    .in("transaction_distribution_id", toMarkPaid);

  return NextResponse.json({
    success: true,
    request_id: payoutReq.request_id,
    net_payout: netPayout,
    stripe_transfer_id: stripeTransferId,
  });
}

export async function GET(_req: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cutoff = new Date(Date.now() - HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: dists } = await admin
    .from("transaction_distributions")
    .select(`
      actual_amount,
      distribution_status,
      is_frozen,
      hold_released,
      transaction:transactions!transaction_id(
        created_at,
        reconciled_at,
        amount_verified,
        amount_mismatch
      )
    `)
    .eq("profile_id", user.id)
    .eq("distribution_status", "accrued")
    .is("deleted_at", null);

  let available = 0;
  let pending = 0;
  let frozen = 0;

  for (const d of dists ?? []) {
    const tx = d.transaction as any;
    const amt = d.actual_amount ?? 0;
    if (d.is_frozen) {
      frozen += amt;
    } else {
      const holdOk = (d as any).hold_released || (tx?.created_at && tx.created_at < cutoff);
      const reconciled = !!tx?.reconciled_at;
      const verified = tx?.amount_verified !== false && (tx?.amount_mismatch ?? 0) === 0;
      if (holdOk && reconciled && verified) {
        available += amt;
      } else {
        pending += amt;
      }
    }
  }

  const { data: history } = await admin
    .from("payout_requests")
    .select("request_id, requested_amount, net_payout_amount, stripe_fee_deducted, status, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({
    available,
    pending,
    frozen,
    transfer_fee: TRANSFER_FEE,
    hold_days: HOLD_DAYS,
    history: history ?? [],
  });
}
