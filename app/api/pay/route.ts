import { NextResponse } from "next/server";
import Stripe from "stripe";

// ビルド時の解析を回避するお守り
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
      // Safariのキャッシュを破壊するタイムスタンプ
      success_url: `${origin}/?v=${Date.now()}`,
      cancel_url: `${origin}/?v=${Date.now()}`,
    });

    // 303リダイレクトを明示
    return NextResponse.redirect(session.url, 303);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}