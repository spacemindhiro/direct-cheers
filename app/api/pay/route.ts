import { NextResponse } from "next/server";
import Stripe from "stripe";

// ビルド時の静的解析を避けるため、外側には何も書かない
export const dynamic = "force-dynamic"; 

export async function POST(request: Request) {
  try {
    // 1. 実行時（POSTされた時）に初めてStripeを初期化する
    // これでビルド時の環境変数エラーや型チェックを物理的に回避
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: "2025-01-27-acacia" as any, // ここは型エラーが出ても実行には影響しない
    });

    const origin = request.headers.get("origin") || "https://direct-cheers.com";

    // 2. チェックアウトセッション作成
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

    // 3. Safariの「前のURLに戻る癖」を破壊する 303 Redirect
    return NextResponse.redirect(session.url, 303);

  } catch (err: any) {
    console.error("Critical Error:", err);
    return NextResponse.json({ error: "System Error" }, { status: 500 });
  }
}