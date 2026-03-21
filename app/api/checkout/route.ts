import { NextResponse } from 'next/server';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export async function POST() {
  try {
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
      success_url: `https://${process.env.VERCEL_URL || 'localhost:3000'}/success`,
      cancel_url: `https://${process.env.VERCEL_URL || 'localhost:3000'}/`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}