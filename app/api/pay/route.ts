import { NextResponse } from "next/server";
import Stripe from "stripe";

// 余計な制御フラグをすべて消し、Stripeの初期化のみに絞る
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(request: Request) {
  try {
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
      // 絶対パスで固定。余計な変数（origin）を使わない
      success_url: "https://direct-cheers.com/",
      cancel_url: "https://direct-cheers.com/",
    });

    // 以前動いていたはずの、Next.js標準のリダイレクト
    return NextResponse.redirect(session.url as string);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}