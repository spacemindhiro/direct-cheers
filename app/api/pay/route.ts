import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: Request) {
  try {
    // フロントからデータを受け取る
    const body = await req.json();
    const { amount, artistId, metadata } = body;

    const stripeKey = process.env.STRIPE_SECRET_KEY || "";
    // 環境変数が無い場合に備えたフォールバック
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    if (!stripeKey) {
      console.error("Missing STRIPE_SECRET_KEY");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }
    
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16' as any,
    });

    // 💡 amount を確実に数値型に変換
    const unitAmount = parseInt(String(amount), 10);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: { 
            name: `${artistId || 'Artist'} への応援`,
            description: metadata?.comment || 'Thank you for your support!',
          },
          unit_amount: unitAmount, 
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}/demo/thanks`,
      cancel_url: `${baseUrl}/demo/cheers`,
      metadata: {
        artistId: artistId || 'demo',
        nickName: metadata?.nickName || '',
        comment: metadata?.comment || '',
      },
    });

    // ✅ 絶対にJSONとしてURLを返す
    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    console.error("Stripe Session Creation Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}