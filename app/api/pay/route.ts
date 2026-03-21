import { NextResponse } from 'next/server';
import Stripe from 'stripe';

// 環境変数からStripeを初期化（ここが抜けると「stripeが見つからない」になります）
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27' as any, // 最新版を指定
});

export async function POST() {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: { name: '応援' },
            unit_amount: 100,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: 'https://direct-cheers.com/',
      cancel_url: 'https://direct-cheers.com/',
      // 【先ほどの403対策】一意のIDを付与
      client_reference_id: `order_${Date.now()}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}