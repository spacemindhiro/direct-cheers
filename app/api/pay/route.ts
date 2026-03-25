import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // Stripe初期化（関数内で行うことでビルドエラーを物理的に回避）
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      // @ts-ignore
      apiVersion: '2023-10-16',
    });

    // Supabase初期化（utilsを通さず、Cookieを参照しないAdmin/Anonクライアントを作成）
    // これにより「未ログイン時の自動リダイレクト」を完全に封殺します
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

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

    // フロントエンドで window.location.href を使うため、URLのみを返す
    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    console.error("API Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}