import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amount, artistId, metadata } = body;
    const stripeKey = process.env.STRIPE_SECRET_KEY || "";
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const cleanSiteUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;

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
      // ⚡️ ここで session_id だけを確実に渡す。メアドは後でサーバーから引く。
      success_url: `${cleanSiteUrl}/demo/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${cleanSiteUrl}/demo/cheers`,
      
      // ⚡️ メアド取得の強制設定
      customer_creation: 'always',
      billing_address_collection: 'required', 

      metadata: {
        artistId: artistId || 'demo',
        nickName: metadata?.nickName || '',
        comment: metadata?.comment || '',
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}