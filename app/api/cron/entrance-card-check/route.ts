/**
 * GET /api/cron/entrance-card-check
 * 日次カード状態確認 cron（毎朝実行）
 *
 * SetupIntent 済み・まだオーソリ前の TypeA 予約に対して
 * Stripe の PaymentMethod を retrieve し、カードが無効化されていないか確認する。
 *
 * 判定基準:
 *   - retrieve 失敗（404等）→ カード削除またはネガティブ VAU/ABU 更新
 *   - exp_month/year が現在より過去 → 有効期限切れ
 * 上記いずれかで: ticket → suspended, reservation → card_error, 予約者メール通知
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCardSuspendedEmail } from "@/lib/email/notification";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();

  // SetupIntent 済み・オーソリ前・カード登録済みの予約を取得
  // stripe_payment_intent_id が null = まだ5日前オーソリが走っていない
  const { data: reservations } = await admin
    .from("entrance_reservations")
    .select(`
      reservation_id, email, status, stripe_payment_method_id, charge_amount,
      product:products(name),
      event:events(title, start_at, lifecycle_status)
    `)
    .eq("status", "reserved")
    .not("stripe_payment_method_id", "is", null)
    .is("stripe_payment_intent_id", null);

  let checked = 0;
  let suspended = 0;
  let errors = 0;

  for (const rsv of reservations ?? []) {
    const ev = rsv.event as any;
    // 終了済みイベントはスキップ
    if (["settled", "cancelled", "ended"].includes(ev?.lifecycle_status ?? "")) continue;
    // 過去のイベントもスキップ
    if (ev?.start_at && new Date(ev.start_at) < now) continue;

    checked++;

    try {
      const pm = await stripe.paymentMethods.retrieve(rsv.stripe_payment_method_id!);
      const card = pm.card;

      // 有効期限チェック
      const isExpired = card
        ? (card.exp_year < now.getFullYear() ||
          (card.exp_year === now.getFullYear() && card.exp_month < now.getMonth() + 1))
        : false;

      if (!isExpired) continue; // 問題なし

      // 有効期限切れ → suspend
      await suspendReservation(admin, rsv, "card_check_failed");
      suspended++;
    } catch {
      // retrieve 失敗 = カード削除 / ネガティブ VAU/ABU 更新
      await suspendReservation(admin, rsv, "card_check_failed");
      suspended++;
    }
  }

  return NextResponse.json({ success: true, checked, suspended, errors });
}

async function suspendReservation(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  rsv: {
    reservation_id: string;
    email: string;
    stripe_payment_method_id?: string | null;
    product?: any;
    event?: any;
  },
  reason: "card_error" | "card_check_failed",
) {
  // reservation を card_error に
  await admin
    .from("entrance_reservations")
    .update({ status: "card_error", card_error_message: reason })
    .eq("reservation_id", rsv.reservation_id);

  // ticket を suspended に
  await admin
    .from("tickets")
    .update({ status: "suspended" })
    .eq("reservation_id", rsv.reservation_id)
    .eq("status", "valid");

  // 予約者に通知メール
  if (rsv.email) {
    sendCardSuspendedEmail({
      to: rsv.email,
      eventTitle: (rsv.event as any)?.title ?? "",
      productName: (rsv.product as any)?.name ?? "",
      reservationId: rsv.reservation_id,
      reason,
    }).catch(() => {});
  }
}
