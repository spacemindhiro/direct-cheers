import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Turbopackのキャッシュ競合エラーを避けるため dynamic 指定は削除

export async function POST() {
  try {
    // 1. 既存の環境変数のみを使用
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // 2. 最小限のバリデーション（ビルド時は通し、実行時にエラーを出す）
    if (!stripeKey || !supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Env Vars:", { stripeKey: !!stripeKey, url: !!supabaseUrl, anon: !!supabaseAnonKey });
      return NextResponse.json({ error: "Configuration error" }, { status: 500 });
    }

    // 3. Stripe初期化
    const stripe = new Stripe(stripeKey, {
      // @ts-ignore
      apiVersion: '2023-10-16',
    });

    // 4. 【重要】utilsを通さず、Anon Keyで直接クライアントを作成
    // これにより、Cookieの有無（ログイン状態）に関わらずリダイレクトが発生しなくなります
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    console.log("Stripe Session Creating...");

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
      // /demo への戻り先を明示
      success_url: 'https://direct-cheers.com/demo',
      cancel_url: 'https://direct-cheers.com/demo',
    });

    if (!session.url) throw new Error("Stripe session URL generation failed");

    // 5. Safari/Googleアプリ対策：JSONで返してフロントのJSで遷移させる
    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    console.error("API Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}