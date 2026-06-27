/**
 * GET /api/cron/entrance-card-check
 * 日次カード状態確認 cron（毎朝実行）
 *
 * SetupIntent 済み・まだオーソリ前の TypeA 予約に対して
 * Stripe の PaymentMethod を retrieve し、カードが無効化されていないか確認する。
 *
 * 処理結果は daily_business_reports / uncollected_revenue_details に記録する。
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCardSuspendedEmail } from "@/lib/email/notification";
import { saveCronReport, type FailureDetail } from "@/lib/cron-report";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();

  const { data: reservations } = await admin
    .from("entrance_reservations")
    .select(`
      reservation_id, email, status, stripe_payment_method_id, charge_amount,
      product:products(name),
      event:events(title, start_at, lifecycle_status, profiles!organizer_profile_id(display_name, organizer_name))
    `)
    .eq("status", "reserved")
    .not("stripe_payment_method_id", "is", null)
    .is("stripe_payment_intent_id", null);

  const all = reservations ?? [];
  let checked = 0;
  let suspended = 0;
  const failures: FailureDetail[] = [];
  let failedAmount = 0;

  for (const rsv of all) {
    const ev = rsv.event as any;
    if (["settled", "cancelled", "ended"].includes(ev?.lifecycle_status ?? "")) continue;
    if (ev?.start_at && new Date(ev.start_at) < now) continue;
    checked++;

    try {
      const pm = await stripe.paymentMethods.retrieve(rsv.stripe_payment_method_id!);
      const card = pm.card;
      const isExpired = card
        ? (card.exp_year < now.getFullYear() ||
          (card.exp_year === now.getFullYear() && card.exp_month < now.getMonth() + 1))
        : false;

      if (!isExpired) continue;

      await suspendReservation(admin, rsv, "card_check_failed");
      suspended++;
      failedAmount += rsv.charge_amount;
      failures.push({
        eventName:     ev?.title ?? "",
        organizerName: ev?.profiles?.organizer_name ?? ev?.profiles?.display_name ?? "",
        customerName:  rsv.email,
        amount:        rsv.charge_amount,
        failureReason: "カード有効期限切れ",
      });
    } catch {
      await suspendReservation(admin, rsv, "card_check_failed");
      suspended++;
      failedAmount += rsv.charge_amount;
      failures.push({
        eventName:     ev?.title ?? "",
        organizerName: ev?.profiles?.organizer_name ?? ev?.profiles?.display_name ?? "",
        customerName:  rsv.email,
        amount:        rsv.charge_amount,
        failureReason: "カード情報取得失敗（VAU/ABUネガティブ更新または削除済み）",
      });
    }
  }

  const successCount = checked - suspended;
  await saveCronReport({
    taskName: "前売りカード状態日次確認バッチ",
    targetCount:   checked,
    targetAmount:  all.filter((r) => {
      const ev = r.event as any;
      return !["settled","cancelled","ended"].includes(ev?.lifecycle_status ?? "") &&
             !(ev?.start_at && new Date(ev.start_at) < now);
    }).reduce((s, r) => s + r.charge_amount, 0),
    successCount,
    successAmount: 0, // カード確認は金額を動かさない
    failedCount:   suspended,
    failedAmount,
    failures,
  });

  return NextResponse.json({ success: true, checked, suspended });
}

async function suspendReservation(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  rsv: { reservation_id: string; email: string; stripe_payment_method_id?: string | null; product?: any; event?: any },
  reason: "card_error" | "card_check_failed",
) {
  await admin
    .from("entrance_reservations")
    .update({ status: "card_error", card_error_message: reason })
    .eq("reservation_id", rsv.reservation_id);

  await admin
    .from("tickets")
    .update({ status: "suspended" })
    .eq("reservation_id", rsv.reservation_id)
    .eq("status", "valid");

  // Wallet パスを即時更新（suspended → 支払い警告表示）
  const { data: tkt } = await admin
    .from("tickets")
    .select("ticket_id")
    .eq("reservation_id", rsv.reservation_id)
    .maybeSingle();
  if (tkt?.ticket_id) pushWalletUpdateBySerial(tkt.ticket_id).catch(() => {});

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
