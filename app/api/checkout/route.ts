import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  try {
    const session = await stripe.checkout.sessions.create({
      // 管理画面でONにしたものを、ここで明示的に呼び出します
      payment_method_types: ['card', 'paypay', 'google_pay', 'apple_pay'],
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: { 
              name: 'Direct Cheers 投げ銭',
              description: '応援ありがとうございます！',
            },
            unit_amount: 100,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `https://direct-cheers.com/success`,
      cancel_url: `https://direct-cheers.com/`,
    } as any); // TypeScriptの型エラーをねじ伏せる

    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    console.error("Stripe API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}