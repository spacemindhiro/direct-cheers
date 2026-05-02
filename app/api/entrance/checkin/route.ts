/**
 * POST /api/entrance/checkin
 * オーガナイザーがQRスキャン → チェックイン処理
 *
 * タイプC（当日決済）の場合: Stripe PaymentIntent を作成して即時決済
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";
import { getFeeConfig } from "@/lib/fee-config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!["organizer", "admin", "agent"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ticket_code } = await req.json() as { ticket_code: string };
  if (!ticket_code) {
    return NextResponse.json({ error: "Missing ticket_code" }, { status: 400 });
  }

  const admin = createAdminClient();

  // チケット情報取得
  const { data: ticket } = await admin
    .from("tickets")
    .select(`
      ticket_id, ticket_code, status, email, event_id, product_id,
      reservation_id, transaction_id,
      product:products(name, payment_type, min_amount),
      event:events(title, organizer_profile_id, agent_id)
    `)
    .eq("ticket_code", ticket_code)
    .maybeSingle();

  if (!ticket) {
    return NextResponse.json({ error: "TICKET_NOT_FOUND" }, { status: 404 });
  }

  // ステータスチェックを権限チェックより先に（ALREADY_USEDを確実に返すため）
  if (ticket.status === "used") {
    return NextResponse.json({ error: "ALREADY_USED", ticket }, { status: 409 });
  }
  if (ticket.status === "cancelled") {
    return NextResponse.json({ error: "TICKET_CANCELLED" }, { status: 409 });
  }

  // イベントへのアクセス権チェック
  const ev = ticket.event as any;
  if (
    ev?.organizer_profile_id !== user.id &&
    ev?.agent_id !== user.id &&
    profile?.role !== "admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prod = ticket.product as any;
  const paymentType = prod?.payment_type as "A" | "B" | "C";

  // タイプC: チェックイン時に決済実行
  if (paymentType === "C" && !ticket.transaction_id) {
    const { data: reservation } = await admin
      .from("entrance_reservations")
      .select("stripe_customer_id, stripe_payment_method_id, charge_amount")
      .eq("reservation_id", ticket.reservation_id as string)
      .single();

    if (!reservation?.stripe_payment_method_id) {
      return NextResponse.json({ error: "No payment method on file" }, { status: 400 });
    }

    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: reservation.charge_amount,
        currency: "jpy",
        customer: reservation.stripe_customer_id,
        payment_method: reservation.stripe_payment_method_id,
        confirm: true,
        off_session: true,
        capture_method: "manual",
        metadata: {
          ticket_id: ticket.ticket_id,
          product_id: ticket.product_id,
          event_id: ticket.event_id,
          payment_type: "C",
        },
      });
    } catch (err: any) {
      return NextResponse.json({ error: "PAYMENT_FAILED", detail: err.message }, { status: 402 });
    }

    // transaction 作成
    const cGross = reservation.charge_amount;
    const cFeeConfig = await getFeeConfig();
    const cStripeFee = Math.floor(cGross * cFeeConfig.stripe_rate);
    const cPlatformFee = Math.floor(cGross * cFeeConfig.platform_rate);

    const { data: tx } = await admin
      .from("transactions")
      .insert({
        stripe_payment_intent_id: paymentIntent.id,
        product_id: ticket.product_id,
        sender_name: null,
        status: "completed",
        total_gross_amount: cGross,
        stripe_funds_status: "held_in_platform",
        amount_verified: true,
        amount_mismatch: 0,
        stripe_fee: cStripeFee,
        platform_fee: cPlatformFee,
        net_amount: cGross - cStripeFee - cPlatformFee,
      })
      .select("transaction_id")
      .single();

    // reservation を charged に更新
    await admin
      .from("entrance_reservations")
      .update({ status: "charged", charged_at: new Date().toISOString(), transaction_id: tx?.transaction_id ?? null })
      .eq("reservation_id", ticket.reservation_id as string);

    // ticket に transaction_id をセット
    await admin
      .from("tickets")
      .update({ transaction_id: tx?.transaction_id ?? null })
      .eq("ticket_id", ticket.ticket_id);
  }

  // チェックイン処理（RPC）
  const { error: checkinError } = await admin.rpc("checkin_ticket", {
    p_ticket_code: ticket_code,
    p_organizer_id: user.id,
  });

  if (checkinError) {
    const msg = checkinError.message ?? "";
    if (msg.includes("ALREADY_USED")) return NextResponse.json({ error: "ALREADY_USED" }, { status: 409 });
    if (msg.includes("TICKET_CANCELLED")) return NextResponse.json({ error: "TICKET_CANCELLED" }, { status: 409 });
    return NextResponse.json({ error: checkinError.message }, { status: 500 });
  }

  // Walletパスを更新（fire-and-forget）
  pushWalletUpdateBySerial(ticket.ticket_id).catch(() => {});

  return NextResponse.json({
    ok: true,
    ticket_id: ticket.ticket_id,
    event_title: ev?.title ?? "",
    product_name: prod?.name ?? "",
    email: ticket.email,
  });
}
