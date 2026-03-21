import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // @ts-ignore
  apiVersion: null, 
});

export async function POST() {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: { name: '応援' },
          unit_amount: 100,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://direct-cheers.com/',
      cancel_url: 'https://direct-cheers.com/',
    });

    // 【ここが原因でした】JSONを返すのではなく、直接リダイレクト命令を出す
    return NextResponse.redirect(session.url!, 303);

  } catch (err: any) {
    console.error(err);
    // エラー時はログイン画面へ戻すなどの処理
    return NextResponse.redirect('https://direct-cheers.com/auth/login', 303);
  }
}