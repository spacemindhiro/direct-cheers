/**
 * GET /api/entrance/reservations?email=xxx&r=reservation_id
 * メールアドレスで予約一覧を取得
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  const reservationId = url.searchParams.get("r");

  if (!email) {
    return NextResponse.json({ reservations: [] });
  }

  const admin = createAdminClient();

  let query = admin
    .from("entrance_reservations")
    .select(`
      reservation_id, status, email, charge_amount,
      card_error_message, card_checked_at, charged_at, created_at,
      product:products(name, payment_type),
      event:events(title, venue, start_at)
    `)
    .eq("email", email)
    .not("status", "in", '("cancelled")')
    .order("created_at", { ascending: false })
    .limit(20);

  if (reservationId) {
    // 特定の予約IDを優先表示
    query = admin
      .from("entrance_reservations")
      .select(`
        reservation_id, status, email, charge_amount,
        card_error_message, card_checked_at, charged_at, created_at,
        product:products(name, payment_type),
        event:events(title, venue, start_at)
      `)
      .eq("email", email)
      .eq("reservation_id", reservationId)
      .limit(1);
  }

  const { data: reservations } = await query;

  const mapped = (reservations ?? []).map((r: any) => ({
    reservation_id: r.reservation_id,
    status: r.status,
    email: r.email,
    charge_amount: r.charge_amount,
    card_error_message: r.card_error_message,
    card_checked_at: r.card_checked_at,
    charged_at: r.charged_at,
    product_name: r.product?.name ?? "",
    event_title: r.event?.title ?? "",
    start_at: r.event?.start_at ?? null,
    venue: r.event?.venue ?? null,
  }));

  return NextResponse.json({ reservations: mapped });
}
