/**
 * check-card-validity Edge Function
 *
 * スケジュール: 毎日 15:30 UTC (= 0:30 JST)
 * 対象: status='reserved', payment_type='A', イベント開始が今から10日前後
 *
 * 処理:
 * stripe.paymentMethods.retrieve() でカード情報を取得し、
 * 有効期限・ブランドを確認する（課金APIは使用しないため決済通知なし）
 *
 * - 期限切れ or ステータス異常 → reservation を 'card_error' に更新 + メール通知
 * - 問題なし → card_checked_at を更新（記録のみ）
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { sendMail, cardErrorEmail } from "../_shared/mailer.ts";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY      = Deno.env.get("STRIPE_SECRET_KEY")!;
const SITE_URL        = (Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "https://direct-cheers.jp").replace(/\/$/, "");
const INTERNAL_SECRET = Deno.env.get("INTERNAL_API_SECRET") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const stripe   = new Stripe(STRIPE_KEY);

Deno.serve(async (_req) => {
  console.log("[check-card-validity] started");

  // 10日前チェック対象の予約を取得
  const { data: reservations, error: fetchErr } = await supabase
    .rpc("get_pending_card_check_reservations");

  if (fetchErr) {
    console.error("[check-card-validity] fetch error:", fetchErr.message);
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }

  const results = { ok: 0, expired: 0, error: 0, skipped: 0 };

  for (const r of reservations ?? []) {
    if (!r.stripe_payment_method_id) {
      results.skipped++;
      continue;
    }

    try {
      // カード情報を取得（課金なし）
      const pm = await stripe.paymentMethods.retrieve(r.stripe_payment_method_id);

      if (pm.type !== "card" || !pm.card) {
        // card 以外のタイプ（PayPay等）はスキップ
        results.skipped++;
        continue;
      }

      const card = pm.card;
      const now  = new Date();
      const expYear  = card.exp_year;
      const expMonth = card.exp_month;

      // イベント日までに有効期限が切れるか確認
      // expMonth/expYear の月末まで有効として判定
      const expiryDate  = new Date(expYear, expMonth, 1); // 有効期限月の翌月1日
      const eventDateApprox = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 今から10日後(≒イベント日)

      let errorReason: string | null = null;

      if (expiryDate <= now) {
        errorReason = `カードの有効期限が切れています（${expYear}年${expMonth}月）`;
      } else if (expiryDate <= eventDateApprox) {
        // イベント当日までに期限切れになる
        errorReason = `カードの有効期限（${expYear}年${expMonth}月）がイベント前後に切れます`;
      }

      // Stripe が保存している直近チェック結果を確認
      const checks = card.checks;
      if (
        checks?.cvc_check === "fail" ||
        checks?.address_postal_code_check === "fail"
      ) {
        errorReason = errorReason ?? "カードの確認に失敗しています（CVC / 郵便番号不一致）";
      }

      if (errorReason) {
        // card_error に更新
        await supabase
          .from("entrance_reservations")
          .update({
            status: "card_error",
            card_error_message: errorReason,
            card_checked_at: new Date().toISOString(),
          })
          .eq("reservation_id", r.reservation_id);

        // チケットを無効化
        const { data: ticketRow } = await supabase
          .from("tickets")
          .update({ status: "cancelled" })
          .eq("reservation_id", r.reservation_id)
          .select("ticket_id")
          .single();

        // Apple Wallet 無効化（fire-and-forget）
        if (ticketRow?.ticket_id && INTERNAL_SECRET) {
          fetch(`${SITE_URL}/api/internal/wallet-push`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET },
            body: JSON.stringify({ ticket_id: ticketRow.ticket_id }),
          }).catch(() => {});
        }

        results.expired++;
        console.warn("[check-card-validity] card issue:", r.reservation_id, errorReason);

        const repurchaseUrl = `${SITE_URL}/entrance/${r.product_id}`;

        await sendMail({
          to: r.email,
          subject: `【重要】${r.event_title} のチケットが無効になりました`,
          html: cardErrorEmail({
            eventTitle:  r.event_title,
            productName: r.product_name,
            errorMessage: errorReason,
            repurchaseUrl,
          }),
        });

      } else {
        // 問題なし → card_checked_at のみ更新（ステータスはそのまま）
        await supabase
          .from("entrance_reservations")
          .update({ card_checked_at: new Date().toISOString() })
          .eq("reservation_id", r.reservation_id);

        results.ok++;
        console.log("[check-card-validity] card ok:", r.reservation_id,
          `${card.brand} **** ${card.last4} exp:${expMonth}/${expYear}`);
      }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[check-card-validity] stripe error:", r.reservation_id, message);

      // Stripe で payment_method が見つからない等のエラー
      await supabase
        .from("entrance_reservations")
        .update({
          status: "card_error",
          card_error_message: `カード情報の取得に失敗しました: ${message}`,
          card_checked_at: new Date().toISOString(),
        })
        .eq("reservation_id", r.reservation_id);

      results.error++;
    }
  }

  console.log("[check-card-validity] done:", results);
  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
