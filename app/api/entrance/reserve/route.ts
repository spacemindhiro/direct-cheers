/**
 * POST /api/entrance/reserve
 *
 * タイプA: Setup Intent を作成し、フロントでカード保存 → complete へ
 * タイプB: Checkout Session（即時決済）を作成し、Stripe リダイレクト
 * タイプC: 当日決済専用（タッチ決済 or QR自己決済）のため、このルートの対象外（400を返す）
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { evaluatePurchaseWindow, purchaseWindowErrorMessage } from "@/lib/purchase-window";
import { buildEntrancePaymentParams, EntranceAccountIncompleteError } from "@/lib/entrance-payment";
import { setCustomerEmailCookie } from "@/lib/customer-email-cookie";
import { CHECKOUT_EXPIRES_SEC, CHECKOUT_HOLD_TTL_SEC, holdStock, releaseStock } from "@/lib/stock-hold";

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

  const { product_id, holder_name, qr_config_id } = body;
  let { customer_email } = body;

  if (!product_id || !customer_email) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ログイン済みの場合はそのメールで上書き（フォーム入力ミスを排除）
  const loggedInUser = await getUser();
  if (loggedInUser?.email) customer_email = loggedInUser.email;

  // 成功レスポンス共通: 簡易ログイン用Cookie（httpOnly）をサーバー側でセットする。
  // 以前はフォーム側が document.cookie で書いていた分の置き換え。
  const ok = (payload: Record<string, unknown>) => {
    const response = NextResponse.json(payload);
    setCustomerEmailCookie(response, customer_email);
    return response;
  };

  // 商品情報取得
  const { data: product } = await admin
    .from("products")
    .select("product_id, type, payment_type, stock_limit, sold_count, charge_amount: min_amount, name, event_id, track_inventory, sales_start_at, sales_end_at")
    .eq("product_id", product_id)
    .is("deleted_at", null)
    .single();

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const paymentType = (product as any).payment_type as "A" | "B" | "C";

  // タイプCは当日決済限定（タッチ決済 or 当日QR自己決済）の商品であり、
  // 事前予約（カード保存→チェックイン時課金）は存在しない。予約フローに来たら拒否する。
  if (paymentType === "C") {
    return NextResponse.json(
      { error: "この商品は当日決済専用です。事前予約はできません。" },
      { status: 400 },
    );
  }

  const eventId = (product as any).event_id as string;
  const amount = (product as any).charge_amount as number;

  // イベント情報取得
  const { data: event } = await admin
    .from("events")
    .select("title, start_at, end_at, venue, lifecycle_status")
    .eq("event_id", eventId)
    .single();

  // QR経由の場合、そのQRが生きていて、この商品のQRであることを確かめる（bypass_validity もQRから取る）
  let bypassValidity = false;
  if (qr_config_id) {
    const { data: qrc } = await admin
      .from("qr_configs")
      .select("product_id, event_id, bypass_validity")
      .eq("qr_config_id", qr_config_id)
      .is("deleted_at", null)
      .maybeSingle();
    const matches = qrc && (qrc.product_id ? qrc.product_id === product_id : qrc.event_id === eventId);
    if (!matches) {
      return NextResponse.json({ error: "この決済リンクに対応する商品ではありません" }, { status: 400 });
    }
    bypassValidity = qrc.bypass_validity === true;
  }

  // 販売期間・イベント状態は決済画面と同じ関数で判定する（画面だけの判定だったため
  // APIを直接叩けば販売期間外・中止イベントでも予約できていた。2026-10-10修正）。
  // 在庫を確保する前に判定し、弾く予約で在庫を減らさない。
  const verdict = evaluatePurchaseWindow({
    lifecycleStatus: event?.lifecycle_status,
    eventStartAt: event?.start_at,
    eventEndAt: event?.end_at,
    product: product as any,
    bypassValidity,
  });
  if (!verdict.ok) {
    return NextResponse.json({ error: purchaseWindowErrorMessage(verdict), reason: verdict.reason }, { status: 409 });
  }

  // タイプAは予約そのものが枠の確保なので、その場で在庫を確保する。
  // タイプBは決済の仮押さえ（下）にする。以前はBも決済開始時に販売済みにしており、
  // 払わずに離脱しても戻らなかった（2026-10-11修正）
  if (paymentType === "A") {
    const { data: hasStock } = await admin.rpc("reserve_product_stock", {
      p_product_id: product_id,
    });
    if (!hasStock) {
      return NextResponse.json({ error: "SOLD_OUT" }, { status: 409 });
    }
  }

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

    const hold = await holdStock(admin, product_id, 1, CHECKOUT_HOLD_TTL_SEC);
    if (hold.status === "sold_out") {
      return NextResponse.json({ error: "SOLD_OUT" }, { status: 409 });
    }
    const holdKey = hold.status === "held" ? hold.holdKey : null;

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        customer_email,
        ...(holdKey ? { expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRES_SEC } : {}),
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
              // 実会場への入場券であることをStripe側に明示する
              ...((event as any)?.venue ? { description: `イベント会場: ${(event as any).venue} への入場チケット` } : {}),
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
          event_venue: (event as any)?.venue ?? "",
          payment_type: "B",
          holder_name: holder_name ?? "",
          qr_config_id: effectiveQrConfigId,
          ticket_channel: "advance_purchase_onsite_admission",
          ...(holdKey ? { stock_hold_key: holdKey } : {}),
        },
      });
    } catch (err) {
      if (holdKey) await releaseStock(admin, holdKey);
      throw err;
    }
    return ok({ type: "B", url: session.url });
  }

  // ----- タイプA/C: カード入力（SetupIntent or 5日以内はPaymentIntent直接オーソリ） -----

  // Stripe Customer を作成 or 取得（メアドはログイン済みなら上書き済みのため直引き）
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
        event_venue: (event as any)?.venue ?? "",
        payment_type: "A",
        holder_name: holder_name ?? "",
        charge_amount: String(amount),
        ticket_channel: "advance_reservation_onsite_checkin",
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

    return ok({
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
      event_venue: (event as any)?.venue ?? "",
      payment_type: paymentType,
      holder_name: holder_name ?? "",
      charge_amount: String(amount),
      ticket_channel: "advance_reservation_onsite_checkin",
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

  return ok({
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
