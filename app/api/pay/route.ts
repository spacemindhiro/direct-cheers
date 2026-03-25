import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Turbopackのキャッシュ制限を回避
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // 1. 環境変数を取得。空なら空文字列を入れる（チェックで落とさない）
    const stripeKey = process.env.STRIPE_SECRET_KEY || "";
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    // 2. Stripe初期化
    // キーが空だとここでStripeがエラーを吐くので、それをキャッチして原因を特定する
    const stripe = new Stripe(stripeKey, {
      // @ts-ignore
      apiVersion: '2023-10-16',
    });

    // 3. Supabase初期化 (既存のAnon Keyを使用)
    // utilsを通さないのでリダイレクトは起きません
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    console.log("Creating session...");

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
      success_url: 'https://direct-cheers.com/demo',
      cancel_url: 'https://direct-cheers.com/demo',
    });

    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    // 【重要】何が足りないのか、ブラウザのアラートに直接表示させる
    const errorMsg = `Message: ${err.message} | Keys: STRIPE=${!!process.env.STRIPE_SECRET_KEY}, URL=${!!process.env.NEXT_PUBLIC_SUPABASE_URL}, ANON=${!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`;
    console.error(errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}