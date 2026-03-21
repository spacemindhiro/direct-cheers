import { NextResponse } from "next/server";
import Stripe from "stripe";

// 環境変数の存在チェックを厳格に行い、型エラーを未然に防ぎます
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY is not defined in environment variables");
}

// 初期化。apiVersion を指定せず、型キャストで最新の構造に適合させます
const stripe = new Stripe(stripeSecretKey, {} as any);

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

    if (!session.url) {
      throw new Error("Stripe session URL is missing");
    }

    // Safariの「ログイン画面へのリダイレクト記憶」を上書きする 303 See Other
    return NextResponse.redirect(session.url, 303);

  } catch (err: any) {
    console.error("Stripe Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" }, 
      { status: 500 }
    );
  }
}