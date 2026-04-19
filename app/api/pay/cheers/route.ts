import { NextResponse } from "next/server";
import Stripe from "stripe";

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

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    payment_method_types: paymentMethodTypes,
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
    customer_creation: "always",
    metadata: {
      qr_config_id,
      product_id,
      artist_name: metadata?.artist_name ?? "",
      event_title: metadata?.event_title ?? "",
    },
  };

  // 既知メアドがあれば pre-fill
  if (customer_email) {
    sessionParams.customer_email = customer_email;
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
