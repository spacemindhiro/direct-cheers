/**
 * POST /api/entrance/complete
 *
 * タイプA/C: SetupIntent confirm 後にフロントから呼ばれる。
 * - reservation を 'reserved' に更新
 * - タイプC（当日決済）でなければここでチケット発行はしない（決済後に発行）
 * - タイプC はチケットを発行する（チェックイン時に決済）
 *
 * タイプB: Stripe Checkout の complete フックから呼ばれる（session_id で）
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeeConfig } from "@/lib/fee-config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const body = await req.json() as {
    // タイプA/C
    reservation_id?: string;
    setup_intent_id?: string;
    payment_method_id?: string;
    // タイプB
    session_id?: string;
  };

  const admin = createAdminClient();

  // ----- タイプB: Checkout Session 完了 -----
  if (body.session_id) {
    return handleTypeB(admin, body.session_id);
  }

  // ----- タイプA/C: Setup Intent 完了 -----
  if (!body.reservation_id) {
    return NextResponse.json({ error: "Missing reservation_id" }, { status: 400 });
  }

  const { data: reservation } = await admin
    .from("entrance_reservations")
    .select("*, product:products(payment_type, name, track_inventory)")
    .eq("reservation_id", body.reservation_id)
    .single();

  if (!reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  if (reservation.status !== "pending") {
    return NextResponse.json({ error: "Already processed" }, { status: 409 });
  }

  // SetupIntent から paymentMethodId を取得
  let paymentMethodId = body.payment_method_id;
  if (!paymentMethodId && body.setup_intent_id) {
    const si = await stripe.setupIntents.retrieve(body.setup_intent_id);
    paymentMethodId = si.payment_method as string | undefined;
  }
  if (!paymentMethodId) {
    // setup_intent_id から取得
    const si = await stripe.setupIntents.retrieve(reservation.stripe_setup_intent_id);
    paymentMethodId = si.payment_method as string | undefined;
  }

  if (!paymentMethodId) {
    return NextResponse.json({ error: "Payment method not found" }, { status: 400 });
  }

  // PaymentMethod を Customer にアタッチ
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: reservation.stripe_customer_id,
  });

  // reservation を reserved に更新
  await admin
    .from("entrance_reservations")
    .update({
      status: "reserved",
      stripe_payment_method_id: paymentMethodId,
    })
    .eq("reservation_id", reservation.reservation_id);

  const paymentType = (reservation.product as any).payment_type as "A" | "B" | "C";

  // タイプC: 予約時点でチケット発行（チェックイン時に決済するため）
  let ticket = null;
  if (paymentType === "C") {
    ticket = await issueTicket(admin, {
      reservationId: reservation.reservation_id,
      productId: reservation.product_id,
      eventId: reservation.event_id,
      email: reservation.email,
      transactionId: null,
    });
  }

  return NextResponse.json({
    ok: true,
    ticket_id: ticket?.ticket_id ?? null,
    ticket_code: ticket?.ticket_code ?? null,
    payment_type: paymentType,
  });
}

async function handleTypeB(admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>, sessionId: string) {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
  }

  const meta = session.metadata ?? {};
  const productId = meta.product_id;
  const eventId = meta.event_id;
  const email = session.customer_email ?? "";

  if (!productId || !eventId) {
    return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
  }

  // 冪等性チェック
  const { data: existingTicket } = await admin
    .from("tickets")
    .select("ticket_id, ticket_code")
    .eq("transaction_id", session.payment_intent as string ?? "")
    .maybeSingle();

  if (existingTicket) {
    return NextResponse.json({ ok: true, ticket_id: existingTicket.ticket_id, ticket_code: existingTicket.ticket_code });
  }

  // transaction を作成
  const bGross = session.amount_total ?? 0;
  const bFeeConfig = await getFeeConfig();
  const bStripeFee = Math.floor(bGross * bFeeConfig.stripe_rate);
  const bPlatformFee = Math.floor(bGross * bFeeConfig.platform_rate);

  const { data: tx } = await admin
    .from("transactions")
    .insert({
      stripe_payment_intent_id: session.payment_intent as string,
      product_id: productId,
      sender_name: meta.holder_name || null,
      status: "completed",
      total_gross_amount: bGross,
      stripe_funds_status: "held_in_platform",
      amount_verified: true,
      amount_mismatch: 0,
      stripe_fee: bStripeFee,
      platform_fee: bPlatformFee,
      net_amount: bGross - bStripeFee - bPlatformFee,
    })
    .select("transaction_id")
    .single();

  const ticket = await issueTicket(admin, {
    reservationId: null,
    productId,
    eventId,
    email,
    transactionId: tx?.transaction_id ?? null,
  });

  // provisional_users 更新
  if (email) {
    const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
    await admin
      .from("provisional_users")
      .upsert({ email, stripe_customer_id: stripeCustomerId ?? undefined }, { onConflict: "email" });
  }

  return NextResponse.json({
    ok: true,
    ticket_id: ticket?.ticket_id ?? null,
    ticket_code: ticket?.ticket_code ?? null,
  });
}

async function issueTicket(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  opts: {
    reservationId: string | null;
    productId: string;
    eventId: string;
    email: string;
    transactionId: string | null;
  }
) {
  // provisional_users → profile_id
  const { data: provisional } = await admin
    .from("provisional_users")
    .select("profile_id")
    .eq("email", opts.email)
    .maybeSingle();

  const { data: ticket } = await admin
    .from("tickets")
    .insert({
      transaction_id: opts.transactionId,
      reservation_id: opts.reservationId,
      product_id: opts.productId,
      event_id: opts.eventId,
      email: opts.email,
      holder_profile_id: provisional?.profile_id ?? null,
      status: "valid",
    })
    .select("ticket_id, ticket_code")
    .single();

  return ticket;
}
