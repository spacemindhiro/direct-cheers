import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation'; // 追加
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export async function POST(req: Request) {
  try {
    const { origin } = new URL(req.url);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'paypay'],
      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: { name: '🔥 Direct Cheers (Demo)' },
          unit_amount: 100,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${origin}/?success=true`,
      cancel_url: `${origin}/`,
    });

    // 【重要】JSONを返すのではなく、直接Stripeへリダイレクトさせる
    // 303を指定することで、POSTからGETへ切り替えて確実に飛ばします
    return NextResponse.redirect(session.url, 303); 

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}