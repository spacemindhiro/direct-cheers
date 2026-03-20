import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  try {
    const session = await stripe.checkout.sessions.create({
      // ✅ 修正ポイント：'google_pay', 'apple_pay' を削除しました。
      // これらは 'card' を指定し、かつダッシュボードで有効にしていれば自動で出現します。
      payment_method_types: ['card', 'paypay'],
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: { 
              name: 'Direct Cheers 投げ銭',
              description: 'カード・PayPay・Apple Pay・Google Pay 対応',
            },
            unit_amount: 100,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `https://direct-cheers.com/success`,
      cancel_url: `https://direct-cheers.com/`,
    } as any);

    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    console.error("Stripe API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}