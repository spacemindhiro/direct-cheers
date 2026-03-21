// @ts-nocheck
import { NextResponse } from "next/server";
import Stripe from "stripe";

// 型チェックを完全に無視して初期化
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin") || "https://direct-cheers.com";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "jpy",
            product_data: { name: "応援の気持ち" },
            unit_amount: 100,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}?status=success`,
      cancel_url: `${origin}?status=cancel`,
    });

    // 303リダイレクトでSafariのキャッシュを強制突破
    return NextResponse.redirect(session.url, 303);

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}