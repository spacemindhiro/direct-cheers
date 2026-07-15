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
import { buildEntrancePaymentParams, EntranceAccountIncompleteError } from "@/lib/entrance-payment";

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
      ticket_id, ticket_code, status, email, event_id, product_id, quantity,
      reservation_id, transaction_id,
      product:products(name, type, payment_type, min_amount),
      event:events(title, venue, organizer_profile_id, agent_id)
    `)
    .eq("ticket_code", ticket_code)
    .maybeSingle();

  if (!ticket) {
    return NextResponse.json({ error: "TICKET_NOT_FOUND" }, { status: 404 });
  }

  const prod = ticket.product as any;
  const ev = ticket.event as any;
  const productType = prod?.type as string | undefined;
  const paymentType = prod?.payment_type as "A" | "B" | "C" | "V";
  const isVoucher = productType === "custom" && paymentType === "V";

  // バウチャー（custom/V）: 再利用不可。used/cancelled は問答無用でエラー。
  // ※ エントランスの再入場ロジック（後続の used チェック）より先に判定する。
  if (isVoucher) {
    if (ticket.status === "used") {
      return NextResponse.json({ error: "ALREADY_USED", is_voucher: true }, { status: 409 });
    }
    if (ticket.status === "cancelled") {
      return NextResponse.json({ error: "TICKET_CANCELLED" }, { status: 409 });
    }
    const { error: checkinError } = await admin.rpc("checkin_ticket", {
      p_ticket_code: ticket_code,
      p_organizer_id: user.id,
    });
    if (checkinError) {
      return NextResponse.json({ error: checkinError.message }, { status: 500 });
    }
    pushWalletUpdateBySerial(ticket.ticket_id).catch(() => {});
    return NextResponse.json({
      ok: true,
      is_voucher: true,
      ticket_id: ticket.ticket_id,
      event_title: ev?.title ?? "",
      product_name: prod?.name ?? "",
      email: ticket.email,
    });
  }

  // エントランス: used は「再入場」として通す（QRを維持しているため再スキャンが起きる）
  if (ticket.status === "used") {
    if (
      ev?.organizer_profile_id !== user.id &&
      ev?.agent_id !== user.id &&
      profile?.role !== "admin"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await admin
      .from("tickets")
      .update({ checked_in_at: new Date().toISOString(), checked_in_by: user.id })
      .eq("ticket_id", ticket.ticket_id);
    pushWalletUpdateBySerial(ticket.ticket_id).catch(() => {});
    return NextResponse.json({
      ok: true,
      re_entry: true,
      ticket_id: ticket.ticket_id,
      event_title: ev?.title ?? "",
      product_name: prod?.name ?? "",
      email: ticket.email,
      quantity: ticket.quantity,
    });
  }
  if (ticket.status === "cancelled") {
    return NextResponse.json({ error: "TICKET_CANCELLED" }, { status: 409 });
  }
  if (ticket.status === "suspended") {
    return NextResponse.json({ error: "TICKET_SUSPENDED" }, { status: 409 });
  }

  // イベントへのアクセス権チェック
  if (
    ev?.organizer_profile_id !== user.id &&
    ev?.agent_id !== user.id &&
    profile?.role !== "admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
      const entranceParams = await buildEntrancePaymentParams(admin, stripe, ticket.event_id as string);
      paymentIntent = await stripe.paymentIntents.create({
        amount: reservation.charge_amount,
        currency: "jpy",
        customer: reservation.stripe_customer_id,
        payment_method: reservation.stripe_payment_method_id,
        confirm: true,
        off_session: true,
        capture_method: "manual",
        ...(entranceParams.onBehalfOf ? { on_behalf_of: entranceParams.onBehalfOf } : {}),
        ...(entranceParams.statementDescriptorSuffix
          ? { statement_descriptor_suffix: entranceParams.statementDescriptorSuffix }
          : {}),
        payment_method_options: {
          card: {
            ...(entranceParams.statementDescriptorSuffixKana
              ? { statement_descriptor_suffix_kana: entranceParams.statementDescriptorSuffixKana }
              : {}),
            ...(entranceParams.statementDescriptorSuffixKanji
              ? { statement_descriptor_suffix_kanji: entranceParams.statementDescriptorSuffixKanji }
              : {}),
          },
        },
        metadata: {
          ticket_id: ticket.ticket_id,
          product_id: ticket.product_id,
          event_id: ticket.event_id,
          event_venue: ev?.venue ?? "",
          payment_type: "C",
          // 現地チェックイン時のスタッフ操作で確定する決済であることを明示
          ticket_channel: "onsite_checkin_charge",
          checked_in_by: user.id,
        },
      });
    } catch (err: any) {
      if (err instanceof EntranceAccountIncompleteError) {
        return NextResponse.json(
          { error: "account_incomplete", missing_capabilities: err.missingCapabilities },
          { status: 422 },
        );
      }
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
    quantity: ticket.quantity,
  });
}
