import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amount, artistId, metadata } = body;

    const stripeKey = process.env.STRIPE_SECRET_KEY || "";
    
    // ✅ 修正：指定の環境変数 NEXT_PUBLIC_SITE_URL を使用
    // 末尾のスラッシュの有無を考慮して正規化します
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const cleanSiteUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;

    const successUrl = `${cleanSiteUrl}/demo/thanks?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${cleanSiteUrl}/demo/cheers`;

    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is missing");
    }
    
    const stripe = new Stripe(stripeKey, {
      // @ts-ignore
      apiVersion: '2023-10-16',
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: { 
            name: `${artistId || 'Artist'} への応援`,
          },
          unit_amount: parseInt(String(amount), 10), 
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        artistId: artistId || 'demo',
        nickName: metadata?.nickName || '',
        comment: metadata?.comment || '',
      },
    });

    // ✅ フロントエンドで window.location.href を書き換えるために JSON を返す
    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    console.error("Stripe Session Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}