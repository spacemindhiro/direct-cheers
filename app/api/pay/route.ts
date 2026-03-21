import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27-acacia", // 最新版を使用
});

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
      // 修正ポイント：末尾 / なし ＋ キャッシュ回避のクエリパラメータ
      success_url: `${origin}?status=success`,
      cancel_url: `${origin}?status=cancel`,
    });

    if (!session.url) {
      throw new Error("Stripe session URL is missing");
    }

    // 修正ポイント：Safariに「これは新しい移動だ」とハッキリ伝えるために 303 を使う
    return NextResponse.redirect(session.url, 303);

  } catch (err: any) {
    console.error("Stripe Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}