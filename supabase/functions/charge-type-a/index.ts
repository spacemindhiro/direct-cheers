/**
 * charge-type-a Edge Function
 *
 * スケジュール: 毎日 15:00 UTC (= 0:00 JST)
 * 対象: status='reserved', payment_type='A', イベント開始が今から5日前後
 *
 * 処理:
 * 1. get_pending_charge_reservations(5) で対象予約を取得
 * 2. 各予約に対し Stripe PaymentIntent で off_session 決済
 * 3. 成功: transaction + ticket + reservation をアトミックに更新
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

  const { data: reservations, error: fetchErr } = await supabase
    .rpc("get_pending_charge_reservations", { p_days_before: 5 });

  if (fetchErr) {
    console.error("[charge-type-a] fetch error:", fetchErr.message);
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }

  const results = { success: 0, failed: 0, skipped: 0 };

  const { data: feeRow } = await supabase
    .from("platform_config")
    .select("stripe_rate, platform_rate")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  const STRIPE_RATE   = Number(feeRow?.stripe_rate   ?? 0.036);
  const PLATFORM_RATE = Number(feeRow?.platform_rate ?? 0.10);

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

      // transactions + tickets + entrance_reservations をアトミックに書き込む
      const aStripeFee   = Math.floor(r.charge_amount * STRIPE_RATE);
      const aPlatformFee = Math.floor(r.charge_amount * PLATFORM_RATE);

      const { error: rpcError } = await supabase.rpc("complete_entrance_typea_charge", {
        p_stripe_payment_intent_id: paymentIntent.id,
        p_product_id:               r.product_id,
        p_event_id:                 r.event_id,
        p_email:                    r.email,
        p_gross:                    r.charge_amount,
        p_stripe_fee:               aStripeFee,
        p_platform_fee:             aPlatformFee,
        p_net_amount:               r.charge_amount - aStripeFee - aPlatformFee,
        p_reservation_id:           r.reservation_id,
      });

      if (rpcError) throw new Error(`complete_entrance_typea_charge: ${rpcError.message}`);

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
