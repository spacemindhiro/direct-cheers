import { NextResponse } from "next/server";
import Stripe from "stripe";

// ビルド時の静的解析フリーズを避けるための強制動的フラグ
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(request: Request) {
  try {
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
      // Safariのキャッシュを破壊するクエリ
      success_url: `${origin}/?v=${Date.now()}`,
      cancel_url: `${origin}/?v=${Date.now()}`,
    });

    // 【修正点】nullチェックを厳格に行い、型エラー(2345)を解消する
    const sessionUrl = session.url;

    if (!sessionUrl) {
      throw new Error("Stripe session URL is null");
    }

    // ここで sessionUrl は確実に string 型であることが保証されるため、エラーは消えます
    return NextResponse.redirect(sessionUrl, 303);

  } catch (err: any) {
    console.error("Stripe Checkout Error:", err);
    // エラー時は元のページにリダイレクトさせるか、エラーメッセージを返す
    return NextResponse.json({ error: "決済の初期化に失敗しました" }, { status: 500 });
  }
}