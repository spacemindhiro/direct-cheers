/**
 * POST /api/entrance/update-card
 * カードエラーになった予約に対し、新しい Setup Intent を発行する
 * フロントで新カードを登録後、/api/entrance/complete を呼ぶ
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const { reservation_id, email } = await req.json() as {
    reservation_id: string;
    email: string;
  };

  if (!reservation_id || !email) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: reservation } = await admin
    .from("entrance_reservations")
    .select("reservation_id, status, email, stripe_customer_id, product_id, event_id, charge_amount")
    .eq("reservation_id", reservation_id)
    .eq("email", email) // メールアドレスで所有権確認
    .maybeSingle();

  if (!reservation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!["reserved", "card_error"].includes(reservation.status)) {
    return NextResponse.json({ error: "Cannot update card for this reservation" }, { status: 409 });
  }

  // チケットがキャンセル済みなら復活不可
  const { data: ticket } = await admin
    .from("tickets")
    .select("status")
    .eq("reservation_id", reservation_id)
    .maybeSingle();

  if (ticket?.status === "cancelled") {
    return NextResponse.json(
      { error: "このチケットは無効です。別のカードで新しくご購入ください。" },
      { status: 409 },
    );
  }

  // 新しい Setup Intent を作成
  const setupIntent = await stripe.setupIntents.create({
    customer: reservation.stripe_customer_id,
    payment_method_types: ["card"],
    usage: "off_session",
    metadata: {
      reservation_id: reservation.reservation_id,
      product_id: reservation.product_id,
      event_id: reservation.event_id,
      card_update: "true",
    },
  });

  // 予約を pending に戻す（update-card 中）
  await admin
    .from("entrance_reservations")
    .update({
      status: "pending",
      stripe_setup_intent_id: setupIntent.id,
      card_error_message: null,
      card_error_code: null,
    })
    .eq("reservation_id", reservation.reservation_id);

  return NextResponse.json({
    client_secret: setupIntent.client_secret,
    reservation_id: reservation.reservation_id,
  });
}
