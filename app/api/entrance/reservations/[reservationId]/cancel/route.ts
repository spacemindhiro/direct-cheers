/**
 * POST /api/entrance/reservations/[reservationId]/cancel
 * ユーザー自身による予約キャンセル（SetupIntent段階のみ）
 *
 * - status = "reserved" のみキャンセル可
 * - "charged"（オーソリ済み）以降は不可
 * - Stripe には何もしない（SetupIntentは完了済みオブジェクト、PaymentMethodはCustomerに残す）
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  const { reservationId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // 予約取得（所有確認のためticket経由でholder_profile_idを確認）
  const { data: reservation } = await admin
    .from("entrance_reservations")
    .select("reservation_id, status, email")
    .eq("reservation_id", reservationId)
    .single();

  if (!reservation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 所有確認: このユーザーのticketが存在するか
  const { data: ticket } = await admin
    .from("tickets")
    .select("ticket_id, status")
    .eq("reservation_id", reservationId)
    .eq("holder_profile_id", user.id)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // キャンセル可否チェック
  if (reservation.status !== "reserved") {
    const reason =
      reservation.status === "charged"
        ? "オーソリ済みのためキャンセルできません（イベント5日前以降）"
        : `キャンセルできないステータスです（${reservation.status}）`;
    return NextResponse.json({ error: reason }, { status: 400 });
  }

  // reservation と ticket を cancelled に更新
  const { error: resErr } = await admin
    .from("entrance_reservations")
    .update({ status: "cancelled" })
    .eq("reservation_id", reservationId);

  if (resErr) return NextResponse.json({ error: resErr.message }, { status: 500 });

  await admin
    .from("tickets")
    .update({ status: "cancelled" })
    .eq("ticket_id", ticket.ticket_id);

  // Walletパスを更新（fire-and-forget）
  pushWalletUpdateBySerial(ticket.ticket_id).catch(() => {});

  return NextResponse.json({ ok: true });
}
