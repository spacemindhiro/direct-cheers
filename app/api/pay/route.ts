import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_DEMO_SECRET_KEY) {
      return NextResponse.json({ error: "Key Missing" }, { status: 500 });
    }
    // デモ決済（/demo配下）専用。実際の課金が発生する本番決済ルート
    // （app/api/pay/cheers/route.ts 等）とは意図的にキーを分離している。
    // STRIPE_SECRET_KEY（本番はliveキー）を共有すると、デモ機能でも
    // 実際の課金が発生してしまうため。
    // モジュール読み込み時ではなくハンドラ内で生成する（キー未設定環境でも
    // ビルド自体は失敗させない。Stripeのコンストラクタは空文字だと即座に例外を投げる）。
    const stripe = new Stripe(process.env.STRIPE_DEMO_SECRET_KEY, {
      // @ts-ignore
      apiVersion: '2023-10-16',
    });

    const body = await req.json();
    const { amount, artistId, metadata } = body;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const cleanSiteUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;

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