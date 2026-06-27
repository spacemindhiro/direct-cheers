/**
 * POST /api/entrance/reserve
 *
 * タイプA/C: Setup Intent を作成し、フロントでカード保存 → complete へ
 * タイプB:   Checkout Session（即時決済）を作成し、Stripe リダイレクト
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildEntrancePaymentParams, EntranceAccountIncompleteError } from "@/lib/entrance-payment";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function POST(req: Request) {
  const body = await req.json() as {
    product_id: string;
    customer_email: string;
    holder_name?: string;
    // タイプB のみ使用
    qr_config_id?: string;
  };

  const { product_id, customer_email, holder_name, qr_config_id } = body;

  if (!product_id || !customer_email) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 商品情報取得
  const { data: product } = await admin
    .from("products")
    .select("product_id, payment_type, stock_limit, sold_count, charge_amount: min_amount, name, event_id, track_inventory")
    .eq("product_id", product_id)
    .is("deleted_at", null)
    .single();

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const paymentType = (product as any).payment_type as "A" | "B" | "C";
  const trackInventory: boolean = paymentType !== "C" || (product as any).track_inventory === true;

  // 在庫チェック（タイプA/B、またはC且つtrack_inventory=true）
  if (trackInventory) {
    const { data: hasStock } = await admin.rpc("reserve_product_stock", {
      p_product_id: product_id,
    });
    if (!hasStock) {
      return NextResponse.json({ error: "SOLD_OUT" }, { status: 409 });
    }
  }

  const eventId = (product as any).event_id as string;
  const amount = (product as any).charge_amount as number;

  // イベント情報取得
  const { data: event } = await admin
    .from("events")
    .select("title, start_at")
    .eq("event_id", eventId)
    .single();

  // ----- タイプB: Checkout Session（即時決済） -----
  if (paymentType === "B") {
    const effectiveQrConfigId = qr_config_id ?? "";
    const successUrl = effectiveQrConfigId
      ? `${SITE_URL}/c/${effectiveQrConfigId}/ticket?session_id={CHECKOUT_SESSION_ID}&product_id=${product_id}`
      : `${SITE_URL}/ticket/complete?session_id={CHECKOUT_SESSION_ID}&product_id=${product_id}`;

    let entranceParams;
    try {
      entranceParams = await buildEntrancePaymentParams(admin, stripe, eventId);
    } catch (err: any) {
      if (err instanceof EntranceAccountIncompleteError) {
        return NextResponse.json(
          { error: "account_incomplete", missing_capabilities: err.missingCapabilities },
          { status: 422 },
        );
      }
      throw err;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email,
      payment_intent_data: {
        ...(entranceParams.onBehalfOf ? { on_behalf_of: entranceParams.onBehalfOf } : {}),
        ...(entranceParams.statementDescriptorSuffix
          ? { statement_descriptor_suffix: entranceParams.statementDescriptorSuffix }
          : {}),
      },
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
      line_items: [{
        price_data: {
          currency: "jpy",
          product_data: {
            name: `【入場チケット】${(product as any).name} — ${event?.title ?? ""}`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: `${SITE_URL}/entrance/${product_id}`,
      metadata: {
        product_id,
        event_id: eventId,
        payment_type: "B",
        holder_name: holder_name ?? "",
        qr_config_id: effectiveQrConfigId,
      },
    });
    return NextResponse.json({ type: "B", url: session.url });
  }

  // ----- タイプA/C: カード入力（SetupIntent or 5日以内はPaymentIntent直接オーソリ） -----

  // Stripe Customer を作成 or 取得
  let stripeCustomerId: string;
  const { data: provisional } = await admin
    .from("provisional_users")
    .select("stripe_customer_id")
    .eq("email", customer_email)
    .maybeSingle();

  if (provisional?.stripe_customer_id) {
    stripeCustomerId = provisional.stripe_customer_id;
  } else {
    const customer = await stripe.customers.create({
      email: customer_email,
      name: holder_name ?? undefined,
      metadata: { event_id: eventId, product_id },
    });
    stripeCustomerId = customer.id;
    await admin
      .from("provisional_users")
      .upsert({ email: customer_email, stripe_customer_id: stripeCustomerId }, { onConflict: "email" });
  }

  // イベントまで5日以内かつタイプAなら即時オーソリパス
  const daysUntilEvent = event?.start_at
    ? (new Date(event.start_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    : Infinity;
  const useAuthPath = paymentType === "A" && daysUntilEvent <= 5;

  if (useAuthPath) {
    let entranceParams;
    try {
      entranceParams = await buildEntrancePaymentParams(admin, stripe, eventId);
    } catch (err: any) {
      if (err instanceof EntranceAccountIncompleteError) {
        return NextResponse.json(
          { error: "account_incomplete", missing_capabilities: err.missingCapabilities },
          { status: 422 },
        );
      }
      throw err;
    }

    // PaymentIntent(capture_method:manual) で即時オーソリ
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "jpy",
      customer: stripeCustomerId,
      capture_method: "manual",
      payment_method_types: ["card"],
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
        product_id,
        event_id: eventId,
        payment_type: "A",
        holder_name: holder_name ?? "",
        charge_amount: String(amount),
      },
    });

    const { data: reservation, error: resErr } = await admin
      .from("entrance_reservations")
      .insert({
        product_id,
        event_id: eventId,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_customer_id: stripeCustomerId,
        email: customer_email,
        holder_name: holder_name ?? null,
        charge_amount: amount,
        status: "pending",
      })
      .select("reservation_id")
      .single();

    if (resErr) {
      return NextResponse.json({ error: resErr.message }, { status: 500 });
    }

    return NextResponse.json({
      type: paymentType,
      is_auth: true,
      client_secret: paymentIntent.client_secret,
      reservation_id: reservation!.reservation_id,
      amount,
      event_title: event?.title ?? "",
      product_name: (product as any).name,
      start_at: event?.start_at ?? null,
    });
  }

  // 通常パス: SetupIntent（カード保存 → cron で5日前にオーソリ）
  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    usage: "off_session",
    metadata: {
      product_id,
      event_id: eventId,
      payment_type: paymentType,
      holder_name: holder_name ?? "",
      charge_amount: String(amount),
    },
  });

  const { data: reservation, error: resErr } = await admin
    .from("entrance_reservations")
    .insert({
      product_id,
      event_id: eventId,
      stripe_setup_intent_id: setupIntent.id,
      stripe_customer_id: stripeCustomerId,
      email: customer_email,
      holder_name: holder_name ?? null,
      charge_amount: amount,
      status: "pending",
    })
    .select("reservation_id")
    .single();

  if (resErr) {
    return NextResponse.json({ error: resErr.message }, { status: 500 });
  }

  // タイプA: カード登録を待たずにチケットを即時発行する。
  // 「購入完了」としてチケット画面を見せ、カード登録は非同期に行うUX設計。
  // ステータスは reserved→charged へと後から遷移するが、チケット自体は有効。
  const { data: ticket } = await admin
    .from("tickets")
    .insert({
      reservation_id: reservation!.reservation_id,
      product_id,
      event_id: eventId,
      email: customer_email,
      status: "valid",
    })
    .select("ticket_id, ticket_code")
    .single();

  return NextResponse.json({
    type: paymentType,
    is_auth: false,
    client_secret: setupIntent.client_secret,
    reservation_id: reservation!.reservation_id,
    ticket_id: ticket?.ticket_id ?? null,
    ticket_code: ticket?.ticket_code ?? null,
    amount,
    event_title: event?.title ?? "",
    product_name: (product as any).name,
    start_at: event?.start_at ?? null,
  });
}
