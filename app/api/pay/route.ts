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

    // ⚡️ success_url の設定
    // {CHECKOUT_SESSION_CUSTOMER_EMAIL} は Stripe側で顧客(Customer)が作成された時のみ置換されます
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
      // Apple Pay / Google Pay などを有効化
      // ※Stripe管理画面の「支払い方法」で Apple Pay / Google Pay が有効になっている必要があります
      payment_method_types: ['card'], 
      
      // ⚡️ 修正ポイント：ゲスト決済を防ぎ、必ず「顧客」を作成してメアドを紐付ける設定
      customer_creation: 'always', 
      
      // ⚡️ 重要：決済画面でメールアドレスの入力を必須化
      // これがないと、ゲスト決済扱いになり変数が置換されないケースがあります
      billing_address_collection: 'required',

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
      
      // ⚡️ 追加：決済完了後に顧客のメールアドレスを確実に取得するためのプロパティ
      payment_intent_data: {
        setup_future_usage: 'off_session', // これを指定するとStripeが「今後のために保存」＝顧客作成を優先します
      },

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