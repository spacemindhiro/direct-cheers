import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amount, artistId, metadata } = body;

    const stripeKey = process.env.STRIPE_SECRET_KEY || "";
    
    // ✅ サイトURLの正規化
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const cleanSiteUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;

    // ⚡️ 修正ポイント：URLパラメータに {CHECKOUT_SESSION_CUSTOMER_EMAIL} を追加
    // これにより、Stripeが決済完了後に実際のメアドへ置換してリダイレクトしてくれます。
    const successUrl = `${cleanSiteUrl}/demo/thanks?session_id={CHECKOUT_SESSION_ID}&email={CHECKOUT_SESSION_CUSTOMER_EMAIL}`;
    const cancelUrl = `${cleanSiteUrl}/demo/cheers`;

    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is missing");
    }
    
    const stripe = new Stripe(stripeKey, {
      // @ts-ignore
      apiVersion: '2023-10-16',
    });

    // ✅ Stripe Checkout Sessionの作成
    const session = await stripe.checkout.sessions.create({
      // Apple Pay / Google Pay を有効化（Stripe管理画面での設定も必要です）
      payment_method_types: ['card'], 
      
      // ⚡️ 修正ポイント：メールアドレス取得を確実にする設定
      customer_creation: 'always', 
      billing_address_collection: 'required', // 決済画面でメアド入力を必須化

      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: { 
            name: `${artistId || 'Artist'} への応援`,
            description: 'デジタル証明書発行・アーティスト支援',
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

    // フロントエンドで window.location.href を書き換えるために JSON を返す
    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    console.error("Stripe Session Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}