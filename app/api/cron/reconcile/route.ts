import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Vercel Cron から呼ばれる。Authorization ヘッダーで保護。
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  // 昨日の日付範囲（JST = UTC+9）
  const jstOffset = 9 * 60 * 60 * 1000;
  const todayJST = new Date(now.getTime() + jstOffset);
  todayJST.setUTCHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayJST.getTime() - jstOffset - 24 * 60 * 60 * 1000);
  const yesterdayEnd = new Date(todayJST.getTime() - jstOffset);
  const targetDate = new Date(yesterdayStart.getTime() + jstOffset).toISOString().slice(0, 10);

  // 昨日の未照合 transactions を取得（distributions + qr_config → event も一緒に）
  const { data: transactions, error: txErr } = await admin
    .from("transactions")
    .select(`
      transaction_id,
      stripe_payment_intent_id,
      total_gross_amount,
      reconciled_at,
      qr_config_id,
      qr_config:qr_configs!qr_config_id(
        event_id,
        event:events!event_id(organizer_profile_id)
      ),
      transaction_distributions(
        transaction_distribution_id,
        profile_id,
        actual_amount,
        distribution_status
      )
    `)
    .eq("status", "completed")
    .is("reconciled_at", null)
    .gte("created_at", yesterdayStart.toISOString())
    .lt("created_at", yesterdayEnd.toISOString());

  if (txErr) {
    console.error("[reconcile] fetch transactions error:", txErr.message);
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  const targets = transactions ?? [];
  let matched = 0;
  let mismatched = 0;
  let errors = 0;
  const feeAdjustDetails: {
    transaction_id: string;
    estimated_net: number;
    actual_net: number;
    diff: number;
  }[] = [];

  for (const tx of targets) {
    try {
      // Stripe PaymentIntent を取得（balance_transaction を展開して実際の手数料を取得）
      const pi = await stripe.paymentIntents.retrieve(tx.stripe_payment_intent_id, {
        expand: ["latest_charge.balance_transaction"],
      });

      const charge = pi.latest_charge as Stripe.Charge | null;
      const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;

      const stripeGross = pi.amount_received ?? 0;
      const stripeFee = bt?.fee ?? null;
      const stripeNet = bt?.net ?? null; // Stripe手数料控除後の実額

      // グロス金額チェック（Checkout固定金額なので必ず一致するはず）
      const grossDiff = stripeGross - (tx.total_gross_amount ?? 0);
      const grossMatch = grossDiff === 0;

      if (!grossMatch) {
        mismatched++;
        console.error(`[reconcile] GROSS MISMATCH tx=${tx.transaction_id} expected=${tx.total_gross_amount} actual=${stripeGross}`);
      } else {
        matched++;
      }

      // 手数料の端数による配分額の調整
      // estimated_net = distributions の合計（事前計算値）
      // actual_net = Stripe の balance_transaction.net（実際の手数料控除後）
      const dists = (tx.transaction_distributions ?? []).filter(
        (d: any) => d.distribution_status === "accrued"
      );
      const estimatedNet = dists.reduce((s: number, d: any) => s + (d.actual_amount ?? 0), 0);

      if (stripeNet !== null && estimatedNet > 0 && stripeNet !== estimatedNet) {
        const netDiff = stripeNet - estimatedNet;
        feeAdjustDetails.push({
          transaction_id: tx.transaction_id,
          estimated_net: estimatedNet,
          actual_net: stripeNet,
          diff: netDiff,
        });

        // イベントオーナーを特定
        const organizerProfileId =
          (tx.qr_config as any)?.event?.organizer_profile_id ?? null;

        // 端数優先順位でソート
        // 1. 比率（actual_amount）が大きい順
        // 2. 同率の場合：イベントオーナーが最優先
        const sortedDists = [...dists].sort((a: any, b: any) => {
          if (b.actual_amount !== a.actual_amount) {
            return b.actual_amount - a.actual_amount; // 金額降順
          }
          // 同額の場合：オーナーを最後（端数を受け取る側）に回す
          const aIsOwner = a.profile_id === organizerProfileId ? 1 : 0;
          const bIsOwner = b.profile_id === organizerProfileId ? 1 : 0;
          return bIsOwner - aIsOwner; // オーナーが末尾
        });

        // 按分計算：floor で切り捨て、端数は末尾（オーナー優先）が吸収
        let allocated = 0;
        for (let i = 0; i < sortedDists.length; i++) {
          const d = sortedDists[i] as any;
          const isLast = i === sortedDists.length - 1;
          const adjustedAmount = isLast
            ? stripeNet - allocated  // 端数を全て吸収
            : Math.floor((d.actual_amount / estimatedNet) * stripeNet);

          await admin
            .from("transaction_distributions")
            .update({ actual_amount: adjustedAmount })
            .eq("transaction_distribution_id", d.transaction_distribution_id);

          allocated += adjustedAmount;
        }

        console.log(
          `[reconcile] fee adjusted tx=${tx.transaction_id} organizer=${organizerProfileId} estimated_net=${estimatedNet} actual_net=${stripeNet} diff=${netDiff}`
        );
      }

      // transaction を照合済みに更新
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

    } catch (err: any) {
      errors++;
      console.error(`[reconcile] tx=${tx.transaction_id} error:`, err.message);
      await admin
        .from("transactions")
        .update({
          reconcile_error: err.message,
          reconciled_at: now.toISOString(),
        })
        .eq("transaction_id", tx.transaction_id);
    }
  }

  // イベント単位の照合済みフラグを確認・更新
  const eventIds = [
    ...new Set(
      (targets ?? [])
        .map((tx) => (tx.qr_config as any)?.event_id)
        .filter(Boolean) as string[]
    ),
  ];

  for (const eventId of eventIds) {
    // このイベントの全 completed transactions を取得
    const { data: allQrs } = await admin
      .from("qr_configs")
      .select("qr_config_id")
      .eq("event_id", eventId);
    const qrIds = (allQrs ?? []).map((q) => q.qr_config_id);
    if (qrIds.length === 0) continue;

    const { count: totalTx } = await admin
      .from("transactions")
      .select("transaction_id", { count: "exact", head: true })
      .in("qr_config_id", qrIds)
      .eq("status", "completed");

    const { count: reconciledTx } = await admin
      .from("transactions")
      .select("transaction_id", { count: "exact", head: true })
      .in("qr_config_id", qrIds)
      .eq("status", "completed")
      .not("reconciled_at", "is", null);

    if (totalTx !== null && reconciledTx !== null && totalTx > 0 && totalTx === reconciledTx) {
      await admin
        .from("events")
        .update({ reconciled_at: now.toISOString() })
        .eq("event_id", eventId)
        .is("reconciled_at", null);
      console.log(`[reconcile] event reconciled: event_id=${eventId} total_tx=${totalTx}`);
    }
  }

  // ログを記録
  const summary: Record<string, unknown> = {};
  if (feeAdjustDetails.length > 0) summary.fee_adjustments = feeAdjustDetails;

  await admin.from("reconciliation_logs").insert({
    run_at: now.toISOString(),
    target_date: targetDate,
    total_checked: targets.length,
    total_matched: matched,
    total_mismatched: mismatched,
    total_errors: errors,
    summary: Object.keys(summary).length > 0 ? summary : null,
  });

  if (mismatched > 0) {
    console.error(`[reconcile] GROSS MISMATCH: ${mismatched} transactions — investigate immediately`);
  }

  console.log(
    `[reconcile] done: checked=${targets.length} matched=${matched} mismatched=${mismatched} errors=${errors} fee_adjusted=${feeAdjustDetails.length}`
  );

  return NextResponse.json({
    success: true,
    target_date: targetDate,
    checked: targets.length,
    matched,
    mismatched,
    errors,
    fee_adjusted: feeAdjustDetails.length,
  });
}
