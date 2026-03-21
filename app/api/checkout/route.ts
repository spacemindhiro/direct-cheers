import { NextResponse } from 'next/server';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export async function POST(request: Request) {
  try {
    // Safari対策：現在のドメイン（Origin）をリクエストから直接取得
    const { origin } = new URL(request.url);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'paypay'],
      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: { name: '🔥 Direct Cheers (Demo)' },
          unit_amount: 100, // 100円
        },
        quantity: 1,
      }],
      mode: 'payment',
      // 成功・失敗時に確実に存在する「トップページ」へ戻す
      success_url: `${origin}/?success=true`,
      cancel_url: `${origin}/`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}