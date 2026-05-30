import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

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
    payment_method: "card" | "paypay";
    customer_email?: string;
    metadata?: Record<string, string>;
  };

  if (!qr_config_id || !product_id || !amount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const thanksUrl = `${SITE_URL}/c/${qr_config_id}/thanks?session_id={CHECKOUT_SESSION_ID}`;

  const paymentMethodTypes =
    payment_method === "paypay"
      ? (["paypay"] as unknown as Stripe.Checkout.SessionCreateParams.PaymentMethodType[])
      : (["card"] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[]);

  const loggedInUser = await getUser();
  const loggedInEmail = loggedInUser?.email ?? null;

  const admin = createAdminClient();

  // organizer の Connect ID を取得（card 決済の destination charge 用）
  let organizerConnectId: string | null = null;
  if (payment_method === "card") {
    const { data: qrc } = await admin
      .from("qr_configs")
      .select("event_id")
      .eq("qr_config_id", qr_config_id)
      .single();

    if (qrc?.event_id) {
      const { data: eventRow } = await admin
        .from("events")
        .select("organizer_profile_id")
        .eq("event_id", qrc.event_id)
        .single();

      if (eventRow?.organizer_profile_id) {
        const { data: orgProfile } = await admin
          .from("profiles")
          .select("stripe_connect_id")
          .eq("profile_id", eventRow.organizer_profile_id)
          .single();
        organizerConnectId = orgProfile?.stripe_connect_id ?? null;
      }
    }
  }

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

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: paymentMethodTypes,
    payment_intent_data: {
      // PayPay は仕様上 manual capture 非対応のため即時キャプチャ。カードはオーソリ維持。
      capture_method: payment_method === "paypay" ? "automatic" : "manual",
      ...(organizerConnectId ? { on_behalf_of: organizerConnectId } : {}),
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

  // card の場合は AP/GP を有効化
  if (payment_method === "card") {
    sessionParams.payment_method_options = {
      card: { request_three_d_secure: "automatic" },
    };
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
