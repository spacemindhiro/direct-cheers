/**
 * POST /api/entrance/update-card
 * カードエラーになった予約に対し、カードを再登録する
 *
 * 5日前を超えているかどうかで処理を切り替える:
 *   - 5日以上前: 新しい SetupIntent を発行（カード登録のみ、オーソリは cron が実行）
 *   - 5日以内:   直接 PaymentIntent を作成してオーソリ（その場で確定）
 *
 * フロントはこのレスポンスの is_auth フラグで処理を分岐し、
 * カード入力後に /api/entrance/complete を呼ぶ。
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
    .select(`
      reservation_id, status, email, stripe_customer_id, product_id, event_id, charge_amount,
      event:events(start_at)
    `)
    .eq("reservation_id", reservation_id)
    .eq("email", email)
    .maybeSingle();

  if (!reservation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!["reserved", "card_error"].includes(reservation.status)) {
    return NextResponse.json({ error: "Cannot update card for this reservation" }, { status: 409 });
  }

  // チケットがキャンセル済み（オーガナイザー操作等）なら復活不可
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

  const eventStartAt = (reservation.event as any)?.start_at;
  const daysUntilEvent = eventStartAt
    ? (new Date(eventStartAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    : Infinity;

  // 5日以内: 直接 PaymentIntent でオーソリ（/complete で handleTypeAAuth を呼ぶ）
  if (daysUntilEvent <= 5) {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: reservation.charge_amount,
      currency: "jpy",
      customer: reservation.stripe_customer_id,
      capture_method: "manual",
      payment_method_types: ["card"],
      metadata: {
        reservation_id: reservation.reservation_id,
        product_id: reservation.product_id,
        event_id: reservation.event_id,
        payment_type: "A",
        card_update: "true",
      },
    });

    await admin
      .from("entrance_reservations")
      .update({
        status: "pending",
        stripe_setup_intent_id: null,
        stripe_payment_intent_id: paymentIntent.id,
        card_error_message: null,
        card_error_code: null,
      })
      .eq("reservation_id", reservation.reservation_id);

    return NextResponse.json({
      is_auth: true,
      client_secret: paymentIntent.client_secret,
      reservation_id: reservation.reservation_id,
    });
  }

  // 5日以上前: SetupIntent でカード登録のみ（オーソリは cron が実行）
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

  await admin
    .from("entrance_reservations")
    .update({
      status: "pending",
      stripe_setup_intent_id: setupIntent.id,
      stripe_payment_intent_id: null,
      card_error_message: null,
      card_error_code: null,
    })
    .eq("reservation_id", reservation.reservation_id);

  return NextResponse.json({
    is_auth: false,
    client_secret: setupIntent.client_secret,
    reservation_id: reservation.reservation_id,
  });
}
