import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/entrance-card-update";
import UpdateCardClient, { type UpdateCardView } from "./update-card-client";

/**
 * カード無効メールの「カードを再登録する」リンクの着地先。
 * URLのトークン（?t=）が予約と一致したときだけ予約内容とカード入力を出す。
 * 一致しない（期限切れ・旧メールのリンク）場合は、登録メールへの再送ボタンだけを出す。
 */
export default async function UpdateCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ reservationId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { reservationId } = await params;
  const { t: token } = await searchParams;

  const view = await loadView(reservationId, token);
  return <UpdateCardClient reservationId={reservationId} token={token ?? ""} view={view} />;
}

async function loadView(reservationId: string, token: string | undefined): Promise<UpdateCardView> {
  if (!isUuid(reservationId) || !isUuid(token)) return { kind: "invalid" };

  const admin = createAdminClient();
  const { data: reservation } = await admin
    .from("entrance_reservations")
    .select(`
      status, charge_amount,
      product:products(name),
      event:events(title, venue, start_at)
    `)
    .eq("reservation_id", reservationId)
    .eq("card_update_token", token)
    .maybeSingle();

  if (!reservation) return { kind: "invalid" };

  const { data: ticket } = await admin
    .from("tickets")
    .select("status")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (ticket?.status === "cancelled") return { kind: "cancelled" };

  if (!["reserved", "card_error", "pending"].includes(reservation.status)) return { kind: "not_needed" };

  const event = reservation.event as any;
  return {
    kind: "ready",
    eventTitle: event?.title ?? "",
    venue: event?.venue ?? null,
    startAt: event?.start_at ?? null,
    productName: (reservation.product as any)?.name ?? "",
    amount: reservation.charge_amount,
  };
}
