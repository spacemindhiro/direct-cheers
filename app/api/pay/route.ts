import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // 型チェックを回避するために require を使用
    const Stripe = require("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
      // 末尾スラッシュなし
      success_url: `${origin}?status=success`,
      cancel_url: `${origin}?status=cancel`,
    });

    if (!session || !session.url) {
      throw new Error("Stripe session URL is missing");
    }

    // Safariのキャッシュを破壊する303リダイレクト
    return NextResponse.redirect(session.url, 303);

  } catch (err: any) {
    console.error("Stripe Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" }, 
      { status: 500 }
    );
  }
}