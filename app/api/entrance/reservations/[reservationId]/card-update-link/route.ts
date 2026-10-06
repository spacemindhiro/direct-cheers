/**
 * POST /api/entrance/reservations/[reservationId]/card-update-link
 * カード再登録リンクを、予約に登録されたメールアドレスへ送り直す
 *
 * リンクの期限切れ（再発行で古いリンクが無効化された等）や、トークン導入前に
 * 送られた404リンクから来た人のための救済導線。送り先は予約のメールアドレス
 * 固定なので、第三者が押しても本人にメールが届くだけで情報は渡らない。
 * 予約の有無や状態を外から推測させないため、受付時の応答は常に同じにする。
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCardSuspendedEmail } from "@/lib/email/notification";
import { CARD_UPDATE_RESEND_INTERVAL_SEC, isUuid, issueCardUpdateUrl } from "@/lib/entrance-card-update";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  const { reservationId } = await params;
  const accepted = NextResponse.json({ ok: true });
  if (!isUuid(reservationId)) return accepted;

  const admin = createAdminClient();

  const { data: reservation } = await admin
    .from("entrance_reservations")
    .select(`
      reservation_id, status, email, card_error_message, card_update_token_issued_at,
      product:products(name),
      event:events(title)
    `)
    .eq("reservation_id", reservationId)
    .maybeSingle();

  // カード再登録が必要な状態の予約だけが対象
  if (!reservation?.email || !["card_error", "pending"].includes(reservation.status)) return accepted;

  // pending は「カード再登録を始めて完了しなかった」場合のみ（初回予約の pending は対象外）
  if (reservation.status === "pending" && !reservation.card_update_token_issued_at) return accepted;

  const { data: ticket } = await admin
    .from("tickets")
    .select("status")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (ticket?.status === "cancelled") return accepted;

  const issuedAt = reservation.card_update_token_issued_at
    ? new Date(reservation.card_update_token_issued_at).getTime()
    : 0;
  if (Date.now() - issuedAt < CARD_UPDATE_RESEND_INTERVAL_SEC * 1000) return accepted;

  const updateCardUrl = await issueCardUpdateUrl(admin, reservationId);
  await sendCardSuspendedEmail({
    to: reservation.email,
    eventTitle: (reservation.event as any)?.title ?? "",
    productName: (reservation.product as any)?.name ?? "",
    updateCardUrl,
    reason: reservation.card_error_message === "card_check_failed" ? "card_check_failed" : "card_error",
  });

  return accepted;
}
