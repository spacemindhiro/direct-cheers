/**
 * GET /api/cron/entrance-auth
 * 5日前オーソリ cron（毎日実行）
 *
 * reservation.status = "reserved" かつ event.start_at が5日後（±12h窓）の予約に対して
 * off_session PaymentIntent を作成してオーソリを実行する。
 *
 * 成功: reservation → charged、transaction 作成（settle で後キャプチャ）
 * 失敗: ticket → suspended、reservation → card_error、予約者メール通知
 *
 * 処理結果は daily_business_reports / uncollected_revenue_details に記録する。
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeeConfig } from "@/lib/fee-config";
import { sendCardSuspendedEmail } from "@/lib/email/notification";
import { saveCronReport, type FailureDetail } from "@/lib/cron-report";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();

  // 対象ウィンドウ: 4日後〜6日後（毎日実行なので5日前前後を捕捉）
  const windowStart = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

  const { data: targetEvents } = await admin
    .from("events")
    .select("event_id, title, profiles!organizer_profile_id(display_name, organizer_name)")
    .gte("start_at", windowStart.toISOString())
    .lte("start_at", windowEnd.toISOString())
    .not("lifecycle_status", "in", '("settled","cancelled","ended")');

  const targetEventIds = (targetEvents ?? []).map((e) => e.event_id);
  const eventNameMap = new Map((targetEvents ?? []).map((e) => [
    e.event_id,
    { title: e.title, organizer: (e.profiles as any)?.organizer_name ?? (e.profiles as any)?.display_name ?? "" }
  ]));

  if (targetEventIds.length === 0) {
    await saveCronReport({
      taskName: "5日前・前売り決済確定バッチ",
      totalEvents: 0, targetCount: 0, targetAmount: 0,
      successCount: 0, successAmount: 0, failedCount: 0, failedAmount: 0,
      failures: [],
    });
    return NextResponse.json({ success: true, processed: 0, succeeded: 0, failed: 0 });
  }

  const { data: reservations } = await admin
    .from("entrance_reservations")
    .select(`
      reservation_id, email, stripe_customer_id, stripe_payment_method_id,
      product_id, event_id, charge_amount,
      product:products(name),
      event:events(title, start_at)
    `)
    .eq("status", "reserved")
    .not("stripe_payment_method_id", "is", null)
    .is("stripe_payment_intent_id", null)
    .in("event_id", targetEventIds);

  const all = reservations ?? [];
  const targetCount  = all.length;
  const targetAmount = all.reduce((s, r) => s + r.charge_amount, 0);

  let successCount = 0;
  let successAmount = 0;
  let failedCount = 0;
  let failedAmount = 0;
  const failures: FailureDetail[] = [];

  const feeConfig = await getFeeConfig();

  for (const rsv of all) {
    if (!rsv.stripe_payment_method_id || !rsv.stripe_customer_id) continue;
    const ev = eventNameMap.get(rsv.event_id);

    try {
      const pi = await stripe.paymentIntents.create({
        amount: rsv.charge_amount,
        currency: "jpy",
        customer: rsv.stripe_customer_id,
        payment_method: rsv.stripe_payment_method_id,
        capture_method: "manual",
        confirm: true,
        off_session: true,
        metadata: {
          reservation_id: rsv.reservation_id,
          product_id: rsv.product_id,
          event_id: rsv.event_id,
          payment_type: "A",
          cron: "entrance-auth",
        },
      });

      if (pi.status !== "requires_capture") {
        throw new Error(`Unexpected PI status: ${pi.status}`);
      }

      const gross = rsv.charge_amount;
      const stripeFee   = Math.floor(gross * feeConfig.stripe_rate);
      const platformFee = Math.floor(gross * feeConfig.platform_rate);

      const { error: rpcError } = await admin.rpc("complete_entrance_typea_charge", {
        p_stripe_payment_intent_id: pi.id,
        p_product_id:               rsv.product_id,
        p_event_id:                 rsv.event_id,
        p_email:                    rsv.email,
        p_gross:                    gross,
        p_stripe_fee:               stripeFee,
        p_platform_fee:             platformFee,
        p_net_amount:               gross - stripeFee - platformFee,
        p_reservation_id:           rsv.reservation_id,
      });

      if (rpcError) throw new Error(rpcError.message);

      successCount++;
      successAmount += rsv.charge_amount;
    } catch (err: any) {
      failedCount++;
      failedAmount += rsv.charge_amount;
      const errMsg: string = err?.message ?? String(err);
      console.error(`[entrance-auth] オーソリ失敗 reservation=${rsv.reservation_id}:`, errMsg);

      failures.push({
        eventName:     ev?.title ?? (rsv.event as any)?.title ?? "",
        organizerName: ev?.organizer ?? "",
        customerName:  rsv.email,
        amount:        rsv.charge_amount,
        failureReason: stripeDeclineToJa(err),
      });

      await admin
        .from("entrance_reservations")
        .update({ status: "card_error", card_error_message: errMsg })
        .eq("reservation_id", rsv.reservation_id);

      await admin
        .from("tickets")
        .update({ status: "suspended" })
        .eq("reservation_id", rsv.reservation_id)
        .eq("status", "valid");

      if (rsv.email) {
        sendCardSuspendedEmail({
          to: rsv.email,
          eventTitle: (rsv.event as any)?.title ?? "",
          productName: (rsv.product as any)?.name ?? "",
          reservationId: rsv.reservation_id,
          reason: "card_error",
        }).catch(() => {});
      }
    }
  }

  await saveCronReport({
    taskName: "5日前・前売り決済確定バッチ",
    totalEvents: targetEventIds.length,
    targetCount, targetAmount,
    successCount, successAmount,
    failedCount, failedAmount,
    failures,
  });

  return NextResponse.json({ success: true, processed: targetCount, succeeded: successCount, failed: failedCount });
}

/**
 * Stripe エラーオブジェクトを日本語業務メッセージに変換する。
 * err.decline_code / err.code / err.message の優先順でチェックする。
 * ※ Stripe の実エラー構造：
 *   message = "Your card has insufficient funds."（自然文）
 *   code = "card_declined"
 *   decline_code = "insufficient_funds"  ← ここにマシンリーダブルコードが入る
 */
function stripeDeclineToJa(err: any): string {
  const code    = err?.decline_code ?? err?.code ?? "";
  const msg     = err?.message ?? String(err);

  if (code === "insufficient_funds")
    return "❌【決済失敗】カードの残高不足です（要現地回収）";
  if (code === "authentication_required" || code === "payment_intent_authentication_failure")
    return "🔒【本人認証未完了】セキュリティロック（要再決済案内）";
  if (code === "expired_card")
    return "カード有効期限切れ";
  if (code === "lost_card")
    return "紛失カード";
  if (code === "stolen_card")
    return "盗難カード";
  if (code === "do_not_honor")
    return "カード会社より利用拒否";
  if (code === "card_declined")
    return "カード会社により拒否";
  // フォールバック: メッセージテキスト検索（後方互換）
  if (msg.includes("insufficient_funds"))       return "❌【決済失敗】カードの残高不足です（要現地回収）";
  if (msg.includes("authentication_required"))  return "🔒【本人認証未完了】セキュリティロック（要再決済案内）";
  return `決済エラー: ${msg.slice(0, 50)}`;
}
