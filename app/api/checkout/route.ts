import { NextResponse } from 'next/server';
import Stripe from 'stripe';

// Stripeの秘密鍵を使って初期化
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  try {
    // 1. Stripeで決済セッションを作成
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: { 
              name: 'Direct Cheers 投げ銭',
              description: '応援ありがとうございます！',
            },
            unit_amount: 100, // 100円
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // 成功時とキャンセル時の戻り先URL
      success_url: `https://direct-cheers.com/success`,
      cancel_url: `https://direct-cheers.com/`,
    });

    // 2. 重要：作成された決済画面の「URL」をブラウザに返す
    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    console.error("Stripe API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}