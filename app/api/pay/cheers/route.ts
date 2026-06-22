import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { checkConnectCapabilities } from "@/lib/stripe-check";
import { buildStatementDescriptorSuffixes } from "@/lib/statement-descriptor";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

type PaymentMethod = "card" | "apple_pay" | "google_pay" | "link" | "paypay";

function resolvePaymentMethodTypes(method: PaymentMethod): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
  if (method === "paypay") return ["paypay"] as unknown as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
  if (method === "link") return ["card", "link"] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
  return ["card"]; // card / apple_pay / google_pay はすべて card type
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    qr_config_id,
    product_id,
    amount,
    payment_method, // 'card' | 'paypay'
    customer_email,
    metadata,
  } = body as {
    qr_config_id: string;
    product_id: string;
    amount: number;
    payment_method: PaymentMethod;
    customer_email?: string;
    metadata?: Record<string, string>;
  };

  if (!qr_config_id || !product_id || !amount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const thanksUrl = `${SITE_URL}/c/${qr_config_id}/thanks?session_id={CHECKOUT_SESSION_ID}`;

  const paymentMethodTypes = resolvePaymentMethodTypes(payment_method);

  const loggedInUser = await getUser();
  const loggedInEmail = loggedInUser?.email ?? null;

  const admin = createAdminClient();

  // organizer の Connect ID を取得（全決済手段で on_behalf_of に使用 — MoR はオーガナイザー）
  // 同時に statement_descriptor_suffix の元になる宛先名義情報も取得する。
  let organizerConnectId: string | null = null;
  const { data: qrc } = await admin
    .from("qr_configs")
    .select(`
      recipient_name_context,
      event:events!event_id(title, organizer_profile_id),
      recipient:profiles!recipient_profile_id(display_name, artist_name, organizer_name)
    `)
    .eq("qr_config_id", qr_config_id)
    .single();

  const eventRow = qrc?.event as any;
  const recipientRow = qrc?.recipient as any;

  if (eventRow?.organizer_profile_id) {
    const { data: orgProfile } = await admin
      .from("profiles")
      .select("stripe_connect_id")
      .eq("profile_id", eventRow.organizer_profile_id)
      .single();
    organizerConnectId = orgProfile?.stripe_connect_id ?? null;
  }

  // このルートはチア/メッセージ決済専用（入場券は /api/entrance/reserve）なので isEntrance は常にfalse
  const { suffix: statementDescriptorSuffix, suffixKana, suffixKanji } = buildStatementDescriptorSuffixes({
    isEntrance: false,
    eventTitle: eventRow?.title,
    recipientNameContext: (qrc?.recipient_name_context as "organizer" | "artist") ?? "artist",
    organizerName: recipientRow?.organizer_name,
    artistName: recipientRow?.artist_name,
    recipientDisplayName: recipientRow?.display_name,
  });

  // 事前登録済みカスタマーIDを引く
  let savedCustomerId: string | null = null;
  if (customer_email && payment_method === "card") {
    const { data } = await admin
      .from("provisional_users")
      .select("stripe_customer_id")
      .eq("email", customer_email)
      .single();
    savedCustomerId = data?.stripe_customer_id ?? null;
  }

  // PayPay は Stripe Connect の on_behalf_of を現行 API でサポートしていない。
  // カード（AP/GP/Link）のみ on_behalf_of を設定し、MoR をオーガナイザーに移転する。
  const useOnBehalfOf = payment_method !== "paypay" && organizerConnectId != null;

  // カード系かつ on_behalf_of を使用する場合、Capability が揃っているか事前検証する。
  // 未完了の Connected Account に対して Stripe が決済を受け付けると客側エラーになるため、
  // 無駄な電文を飛ばす前にバックエンドでブロックする。
  if (useOnBehalfOf) {
    const { ok, missing } = await checkConnectCapabilities(stripe, organizerConnectId!);
    if (!ok) {
      return NextResponse.json(
        { error: "account_incomplete", missing_capabilities: missing },
        { status: 422 },
      );
    }
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: paymentMethodTypes,
    payment_intent_data: {
      // PayPay は仕様上 manual capture 非対応のため即時キャプチャ。カードはオーソリ維持。
      capture_method: payment_method === "paypay" ? "automatic" : "manual",
      ...(useOnBehalfOf ? { on_behalf_of: organizerConnectId! } : {}),
      ...(statementDescriptorSuffix ? { statement_descriptor_suffix: statementDescriptorSuffix } : {}),
    },
    line_items: [
      {
        price_data: {
          currency: "jpy",
          product_data: {
            name: metadata?.artist_name
              ? `${metadata.artist_name} への応援 / ${metadata.event_title ?? ""}`
              : "Direct Cheers",
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: thanksUrl,
    cancel_url: `${SITE_URL}/c/${qr_config_id}`,
    metadata: {
      qr_config_id,
      product_id,
      artist_name: metadata?.artist_name ?? "",
      event_title: metadata?.event_title ?? "",
      device_name: metadata?.device_name ?? "",
      ...(loggedInEmail ? { sender_email: loggedInEmail } : {}),
    },
  };

  if (savedCustomerId) {
    // 保存済みカード → customer で渡す（customer_creation 不要）
    sessionParams.customer = savedCustomerId;
  } else {
    // 未登録 → 新規作成 & メアド pre-fill
    sessionParams.customer_creation = "always";
    if (customer_email) sessionParams.customer_email = customer_email;
  }

  // カード系（card / AP / GP / Link）は 3DS を有効化。PayPay は非対応のため除外。
  // statement_descriptor_suffix_kana/kanji もここに乗せる（日本語名はASCII版だけだと反映されないため）。
  if (payment_method !== "paypay") {
    sessionParams.payment_method_options = {
      card: {
        request_three_d_secure: "automatic",
        ...(suffixKana ? { statement_descriptor_suffix_kana: suffixKana } : {}),
        ...(suffixKanji ? { statement_descriptor_suffix_kanji: suffixKanji } : {}),
      },
    };
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
