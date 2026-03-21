import { NextResponse } from "next/server";

// ビルド時の解析を完全に拒否する
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // 1. ビルド時ではなく「実行時」にライブラリを読み込む (重要)
    const Stripe = require("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const origin = request.headers.get("origin") || "https://direct-cheers.com";

    // 2. セッション作成
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
      success_url: `${origin}/?status=success&v=${Date.now()}`,
      cancel_url: `${origin}/?status=cancel&v=${Date.now()}`,
    });

    // 3. 確実にURLがある場合のみリダイレクト
    if (session && session.url) {
      // Safariのキャッシュを破壊する303リダイレクト
      return NextResponse.redirect(session.url, 303);
    }

    throw new Error("No session URL");
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "error" }, { status: 500 });
  }
}