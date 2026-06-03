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

  // ステータスチェック
  // used は「再入場」として通す（QRを維持しているため再スキャンが起きる）
  if (ticket.status === "used") {
    // 権限チェック（再入場も担当スタッフのみ許可）
    const ev2 = ticket.event as any;
    if (
      ev2?.organizer_profile_id !== user.id &&
      ev2?.agent_id !== user.id &&
      profile?.role !== "admin"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // 再入場を記録（checked_in_at を現在時刻に上書き）
    await admin
      .from("tickets")
      .update({ checked_in_at: new Date().toISOString(), checked_in_by: user.id })
      .eq("ticket_id", ticket.ticket_id);
    // Wallet パスも更新（入場時刻を最新化）
    pushWalletUpdateBySerial(ticket.ticket_id).catch(() => {});
    return NextResponse.json({
      ok: true,
      re_entry: true,
      ticket_id: ticket.ticket_id,
      event_title: ev2?.title ?? "",
      product_name: (ticket.product as any)?.name ?? "",
      email: ticket.email,
    });
  }
  if (ticket.status === "cancelled") {
    return NextResponse.json({ error: "TICKET_CANCELLED" }, { status: 409 });
  }
  if (ticket.status === "suspended") {
    return NextResponse.json({ error: "TICKET_SUSPENDED" }, { status: 409 });
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

    // transactions + entrance_reservations + tickets をアトミックに書き込む
    const cGross = reservation.charge_amount;
    const cFeeConfig = await getFeeConfig();
    const cStripeFee = Math.floor(cGross * cFeeConfig.stripe_rate);
    const cPlatformFee = Math.floor(cGross * cFeeConfig.platform_rate);

    const { error: rpcError } = await admin.rpc("complete_entrance_typec_checkin", {
      p_stripe_payment_intent_id: paymentIntent.id,
      p_product_id:               ticket.product_id,
      p_gross:                    cGross,
      p_stripe_fee:               cStripeFee,
      p_platform_fee:             cPlatformFee,
      p_net_amount:               cGross - cStripeFee - cPlatformFee,
      p_reservation_id:           ticket.reservation_id as string,
      p_ticket_id:                ticket.ticket_id,
    });

    if (rpcError) {
      console.error("[checkin] complete_entrance_typec_checkin error:", rpcError.message);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }
  }

  // チェックイン処理（RPC）
  const { error: checkinError } = await admin.rpc("checkin_ticket", {
    p_ticket_code: ticket_code,
    p_organizer_id: user.id,
  });

  if (checkinError) {
    const msg = checkinError.message ?? "";
    // ALREADY_USED はルート層で先に処理済み（再入場として通す）
    if (msg.includes("TICKET_CANCELLED")) return NextResponse.json({ error: "TICKET_CANCELLED" }, { status: 409 });
    if (msg.includes("TICKET_SUSPENDED")) return NextResponse.json({ error: "TICKET_SUSPENDED" }, { status: 409 });
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
