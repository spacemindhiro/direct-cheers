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

  // 昨日の未照合 transactions を取得
  const { data: transactions, error: txErr } = await admin
    .from("transactions")
    .select("transaction_id, stripe_payment_intent_id, total_gross_amount, reconciled_at")
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
  const mismatchDetails: { transaction_id: string; expected: number; actual: number; diff: number }[] = [];

  for (const tx of targets) {
    try {
      // Stripe PaymentIntent を取得（balance_transaction を展開して手数料を取得）
      const pi = await stripe.paymentIntents.retrieve(tx.stripe_payment_intent_id, {
        expand: ["latest_charge.balance_transaction"],
      });

      const charge = pi.latest_charge as Stripe.Charge | null;
      const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;

      const stripeAmount = pi.amount_received ?? 0;
      const stripeFee = bt?.fee ?? null;
      const stripeNet = bt?.net ?? null;

      const diff = stripeAmount - (tx.total_gross_amount ?? 0);
      const isMatch = diff === 0;

      if (!isMatch) {
        mismatched++;
        mismatchDetails.push({
          transaction_id: tx.transaction_id,
          expected: tx.total_gross_amount ?? 0,
          actual: stripeAmount,
          diff,
        });
      } else {
        matched++;
      }

      // transactions を更新
      await admin
        .from("transactions")
        .update({
          amount_verified: isMatch,
          amount_mismatch: diff,
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

  // ログを記録
  await admin.from("reconciliation_logs").insert({
    run_at: now.toISOString(),
    target_date: targetDate,
    total_checked: targets.length,
    total_matched: matched,
    total_mismatched: mismatched,
    total_errors: errors,
    summary: mismatchDetails.length > 0 ? { mismatches: mismatchDetails } : null,
  });

  // 不一致があった場合はエラーログ出力（将来的にメール通知に拡張）
  if (mismatched > 0) {
    console.error(`[reconcile] MISMATCH DETECTED: ${mismatched} transactions`, JSON.stringify(mismatchDetails));
  }

  console.log(`[reconcile] done: checked=${targets.length} matched=${matched} mismatched=${mismatched} errors=${errors}`);

  return NextResponse.json({
    success: true,
    target_date: targetDate,
    checked: targets.length,
    matched,
    mismatched,
    errors,
    mismatches: mismatchDetails,
  });
}
