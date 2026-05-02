/**
 * charge-type-a Edge Function
 *
 * スケジュール: 毎日 15:00 UTC (= 0:00 JST)
 * 対象: status='reserved', payment_type='A', イベント開始が今から5日前後
 *
 * 処理:
 * 1. get_pending_charge_reservations(5) で対象予約を取得
 * 2. 各予約に対し Stripe PaymentIntent で off_session 決済
 * 3. 成功: transaction + ticket を発行、reservation を 'charged' に更新
 * 4. 失敗: reservation を 'card_error' に更新、ユーザーへメール通知
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { sendMail, chargeSuccessEmail, chargeFailedEmail } from "../_shared/mailer.ts";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY      = Deno.env.get("STRIPE_SECRET_KEY")!;
const SITE_URL        = (Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "https://direct-cheers.jp").replace(/\/$/, "");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const stripe   = new Stripe(STRIPE_KEY);

Deno.serve(async (_req) => {
  console.log("[charge-type-a] started");

  // 5日前の予約を取得
  const { data: reservations, error: fetchErr } = await supabase
    .rpc("get_pending_charge_reservations", { p_days_before: 5 });

  if (fetchErr) {
    console.error("[charge-type-a] fetch error:", fetchErr.message);
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }

  const results = { success: 0, failed: 0, skipped: 0 };

  for (const r of reservations ?? []) {
    if (!r.stripe_payment_method_id) {
      console.warn("[charge-type-a] no payment_method for reservation:", r.reservation_id);
      results.skipped++;
      continue;
    }

    try {
      // Stripe off_session オーソリ（キャプチャは開催確認後）
      const paymentIntent = await stripe.paymentIntents.create({
        amount: r.charge_amount,
        currency: "jpy",
        customer: r.stripe_customer_id,
        payment_method: r.stripe_payment_method_id,
        confirm: true,
        off_session: true,
        capture_method: "manual",
        metadata: {
          reservation_id: r.reservation_id,
          product_id: r.product_id,
          event_id: r.event_id,
          payment_type: "A",
          auto_charge: "true",
        },
      });

      if (paymentIntent.status !== "requires_capture") {
        throw new Error(`PaymentIntent status: ${paymentIntent.status}`);
      }

      // transaction 作成
      const { data: tx, error: txErr } = await supabase
        .from("transactions")
        .insert({
          stripe_payment_intent_id: paymentIntent.id,
          product_id: r.product_id,
          sender_name: null,
          status: "completed",
          total_gross_amount: r.charge_amount,
          stripe_funds_status: "held_in_platform",
          amount_verified: true,
          amount_mismatch: 0,
        })
        .select("transaction_id")
        .single();

      if (txErr) throw new Error(`Transaction insert: ${txErr.message}`);

      // provisional_users → profile_id
      const { data: provisional } = await supabase
        .from("provisional_users")
        .select("profile_id")
        .eq("email", r.email)
        .maybeSingle();

      // ticket 発行
      const { data: ticket } = await supabase
        .from("tickets")
        .insert({
          transaction_id: tx!.transaction_id,
          reservation_id: r.reservation_id,
          product_id: r.product_id,
          event_id: r.event_id,
          email: r.email,
          holder_profile_id: provisional?.profile_id ?? null,
          status: "valid",
        })
        .select("ticket_id")
        .single();

      // reservation を 'charged' に更新
      await supabase
        .from("entrance_reservations")
        .update({
          status: "charged",
          charged_at: new Date().toISOString(),
          transaction_id: tx!.transaction_id,
        })
        .eq("reservation_id", r.reservation_id);

      results.success++;
      console.log("[charge-type-a] charged:", r.reservation_id);

      // 成功メール
      await sendMail({
        to: r.email,
        subject: `【チケット確定】${r.event_title}`,
        html: chargeSuccessEmail({
          eventTitle: r.event_title,
          productName: r.product_name,
          amount: r.charge_amount,
          ticketUrl: `${SITE_URL}/tickets`,
        }),
      });

    } catch (err: unknown) {
      const stripeErr = err as Stripe.StripeRawError | Error;
      const errMessage = "message" in stripeErr ? stripeErr.message : String(err);
      const declineCode = "decline_code" in stripeErr ? stripeErr.decline_code : undefined;

      console.error("[charge-type-a] charge failed:", r.reservation_id, errMessage);

      // reservation を 'card_error' に更新
      await supabase
        .from("entrance_reservations")
        .update({
          status: "card_error",
          card_error_message: errMessage,
          card_error_code: declineCode ?? null,
          retry_count: (r.retry_count ?? 0) + 1,
          last_retry_at: new Date().toISOString(),
        })
        .eq("reservation_id", r.reservation_id);

      results.failed++;

      // エラーメール
      await sendMail({
        to: r.email,
        subject: `【重要】${r.event_title} のチケット決済に失敗しました`,
        html: chargeFailedEmail({
          eventTitle: r.event_title,
          productName: r.product_name,
          errorMessage: humanizeError(errMessage, declineCode),
        }),
      });
    }
  }

  console.log("[charge-type-a] done:", results);
  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
});

function humanizeError(message: string, declineCode?: string): string {
  const codeMap: Record<string, string> = {
    "insufficient_funds":     "カードの残高が不足しています",
    "card_declined":          "カードが拒否されました",
    "expired_card":           "カードの有効期限が切れています",
    "incorrect_cvc":          "セキュリティコードが正しくありません",
    "card_velocity_exceeded": "利用限度額を超えています",
    "do_not_honor":           "カード会社から拒否されました",
  };
  if (declineCode && codeMap[declineCode]) return codeMap[declineCode];
  return message;
}
