import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (me?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { eventId } = await req.json() as { eventId: string };
  if (!eventId)
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });

  // イベントのQR取得
  const { data: qrConfigs } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("event_id", eventId);
  const qrIds = (qrConfigs ?? []).map((q) => q.qr_config_id);
  if (qrIds.length === 0)
    return NextResponse.json({ checked: 0, reconciled: 0, errors: 0 });

  // 未照合 OR エラー済み（再試行対象）のトランザクション取得
  const { data: transactions } = await admin
    .from("transactions")
    .select(`
      transaction_id, stripe_payment_intent_id, total_gross_amount, platform_fee, qr_config_id,
      qr_config:qr_configs!qr_config_id(event_id, event:events!event_id(organizer_profile_id)),
      transaction_distributions(transaction_distribution_id, profile_id, distribution_role, actual_amount, amount_before_reconcile, distribution_status)
    `)
    .in("qr_config_id", qrIds)
    .eq("status", "completed")
    .or("reconciled_at.is.null,reconcile_error.not.is.null,amount_verified.eq.false");

  const now = new Date();
  let reconciled = 0;
  let matched = 0;
  let mismatched = 0;
  let errors = 0;
  const errorDetails: Array<{ transaction_id: string; stripe_pi_id: string | null; error: string }> = [];
  const mismatchDetails: Array<{ transaction_id: string; stripe_pi_id: string | null; expected: number; actual: number; diff: number }> = [];

  for (const tx of transactions ?? []) {
    try {
      let piId = tx.stripe_payment_intent_id as string;
      if (piId?.startsWith("{")) {
        try { const p = JSON.parse(piId); if (p?.id) piId = p.id; } catch {}
      }
      const pi = await stripe.paymentIntents.retrieve(piId, {
        expand: ["latest_charge.balance_transaction"],
      });

      // requires_capture（未キャプチャ）はサイレントスキップせず、資金未回収のエラーとして記録する
      if (pi.status === "requires_capture") {
        const errMsg = "未キャプチャ：イベント終了後に資金が未回収のままです";
        console.warn(`[reconcile] UNCAPTURED tx=${tx.transaction_id} pi=${piId} gross_db=${tx.total_gross_amount}`);
        errors++;
        errorDetails.push({ transaction_id: tx.transaction_id, stripe_pi_id: tx.stripe_payment_intent_id, error: errMsg });
        await admin
          .from("transactions")
          .update({ reconcile_error: errMsg })
          .eq("transaction_id", tx.transaction_id);
        continue;
      }

      const charge = pi.latest_charge as Stripe.Charge | null;
      const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;

      const stripeGross = pi.amount_received ?? 0;
      const stripeFee = bt?.fee ?? null;
      const stripeNet = bt?.net ?? null;
      const grossDiff = stripeGross - (tx.total_gross_amount ?? 0);
      const grossMatch = grossDiff === 0;

      console.log(
        `[reconcile] tx=${tx.transaction_id} pi=${piId}` +
        ` stripe_gross=${stripeGross} db_gross=${tx.total_gross_amount} diff=${grossDiff} match=${grossMatch}` +
        ` stripe_fee=${stripeFee} stripe_net=${stripeNet}`
      );

      const allAccruedDists = ((tx.transaction_distributions ?? []) as any[]).filter(
        (d) => d.distribution_status === "accrued"
      );
      // agent・platform はいずれも固定額 → スケール対象外
      // platform (admin) も固定: gross × platform_rate から agent 分を除いた残り
      const agentDists = allAccruedDists.filter((d: any) => d.distribution_role === "agent");
      const artistOrgDists = allAccruedDists.filter(
        (d: any) => !["agent", "platform"].includes(d.distribution_role)
      );

      // artist/org の調整ターゲット = stripe_net - platform_fee（platformが取る固定額を除いた残り）
      const platformFee = (tx as any).platform_fee ?? 0;
      const artistOrgTarget = stripeNet !== null ? stripeNet - platformFee : null;
      const artistOrgEstimated = artistOrgDists.reduce((s: number, d: any) => s + (d.actual_amount ?? 0), 0);

      if (artistOrgTarget !== null && artistOrgEstimated > 0 && artistOrgTarget !== artistOrgEstimated) {
        const agentTotal = agentDists.reduce((s: number, d: any) => s + (d.actual_amount ?? 0), 0);
        console.log(
          `[reconcile] ADJUST_DIST tx=${tx.transaction_id}` +
          ` artist_org_estimated=${artistOrgEstimated} target=${artistOrgTarget} diff=${artistOrgTarget - artistOrgEstimated}` +
          ` agent(fixed)=${agentTotal} platform_fee=${platformFee} stripe_net=${stripeNet}`
        );
        const organizerProfileId = (tx.qr_config as any)?.event?.organizer_profile_id ?? null;
        const sortedDists = [...artistOrgDists].sort((a: any, b: any) => {
          if (b.actual_amount !== a.actual_amount) return b.actual_amount - a.actual_amount;
          return (b.profile_id === organizerProfileId ? 1 : 0) - (a.profile_id === organizerProfileId ? 1 : 0);
        });
        let allocated = 0;
        for (let i = 0; i < sortedDists.length; i++) {
          const d = sortedDists[i] as any;
          const isLast = i === sortedDists.length - 1;
          const adjustedAmount = isLast
            ? artistOrgTarget - allocated
            : Math.floor((d.actual_amount / artistOrgEstimated) * artistOrgTarget);
          console.log(`[reconcile]   dist=${d.transaction_distribution_id} role=${d.distribution_role} profile=${d.profile_id} before=${d.actual_amount} after=${adjustedAmount}`);
          await admin
            .from("transaction_distributions")
            .update({
              actual_amount: adjustedAmount,
              // 初回調整時のみ記録（再実行で上書きしない）
              ...(d.amount_before_reconcile == null ? { amount_before_reconcile: d.actual_amount } : {}),
            })
            .eq("transaction_distribution_id", d.transaction_distribution_id);
          allocated += adjustedAmount;
        }
      }

      if (!grossMatch) {
        mismatched++;
        mismatchDetails.push({
          transaction_id: tx.transaction_id,
          stripe_pi_id: tx.stripe_payment_intent_id,
          expected: tx.total_gross_amount ?? 0,
          actual: stripeGross,
          diff: grossDiff,
        });
        console.warn(`[reconcile] MISMATCH tx=${tx.transaction_id} pi=${piId} diff=${grossDiff}`);
      }

      await admin
        .from("transactions")
        .update({
          amount_verified: grossMatch,
          amount_mismatch: grossDiff,
          stripe_fee_actual: stripeFee,
          stripe_net_actual: stripeNet,
          reconciled_at: now.toISOString(),
          reconcile_error: null,
        })
        .eq("transaction_id", tx.transaction_id);

      reconciled++;
      if (grossMatch) matched++;
    } catch (err: any) {
      errors++;
      const errMsg: string = err?.message ?? String(err);
      console.error("[reconcile] tx error:", tx.transaction_id, tx.stripe_payment_intent_id, errMsg);
      errorDetails.push({
        transaction_id: tx.transaction_id,
        stripe_pi_id: tx.stripe_payment_intent_id,
        error: errMsg,
      });
      // reconciled_at はセットしない → 次回実行で再試行される
      await admin
        .from("transactions")
        .update({ reconcile_error: errMsg })
        .eq("transaction_id", tx.transaction_id);
    }
  }

  // 全照合済みならイベントフラグを更新
  const { count: remaining } = await admin
    .from("transactions")
    .select("transaction_id", { count: "exact", head: true })
    .in("qr_config_id", qrIds)
    .eq("status", "completed")
    .is("reconciled_at", null);

  if (remaining === 0 && (transactions ?? []).length > 0) {
    await admin
      .from("events")
      .update({ reconciled_at: now.toISOString() })
      .eq("event_id", eventId)
      .is("reconciled_at", null);
  }

  const checked = (transactions ?? []).length;

  await admin.from("reconciliation_logs").insert({
    run_at: now.toISOString(),
    target_date: now.toISOString().slice(0, 10),
    total_checked: checked,
    total_matched: matched,
    total_mismatched: mismatched,
    total_errors: errors,
    // 実行時点のスナップショットとして明細を保存する（後続実行で transactions テーブルの
    // 状態が変わっても、このログ行が示す明細は変化しない）
    summary: {
      manual: true,
      event_id: eventId,
      event_reconciled: remaining === 0,
      mismatches: mismatchDetails,
      errors: errorDetails,
    },
  });

  return NextResponse.json({
    checked,
    reconciled,
    errors,
    mismatched,
    event_reconciled: remaining === 0,
    errorDetails,
    mismatchDetails,
  });
}
