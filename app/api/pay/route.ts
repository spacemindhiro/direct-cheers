// TypeScriptの厳格なチェックを無視して、JavaScriptとして動かす
import { NextResponse } from "next/server";

export async function POST(request) {
  const Stripe = require("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "jpy",
          product_data: { name: "応援" },
          unit_amount: 100,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: "https://direct-cheers.com/",
      cancel_url: "https://direct-cheers.com/",
    });

    // 以前動いていたはずの、最も単純なリダイレクト
    return NextResponse.redirect(session.url);
  } catch (err) {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}