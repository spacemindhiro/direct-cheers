import { NextResponse } from "next/server";

// ビルド時の静的解析を物理的に拒否
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // 【最重要】ビルド時にはここを読み込ませない。実行時にのみロード。
    const Stripe = require("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const origin = request.headers.get("origin") || "https://direct-cheers.com";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "jpy",
          product_data: { name: "応援の気持ち" },
          unit_amount: 100,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${origin}/?status=success`,
      cancel_url: `${origin}/?status=cancel`,
    });

    if (!session.url) {
      throw new Error("Stripe URL generated as null");
    }

    // Safariのリダイレクトキャッシュを物理的に上書きする 303 Redirect
    return NextResponse.redirect(session.url, 303);

  } catch (err: any) {
    console.error("Critical Runtime Error:", err);
    return NextResponse.json({ error: "System Error" }, { status: 500 });
  }
}