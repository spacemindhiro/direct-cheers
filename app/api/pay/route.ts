import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// 1. 環境変数のチェック
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // @ts-ignore
  apiVersion: '2023-10-16', 
});

// 2. Cookieに依存しないSupabaseクライアント（デモ用/サーバー用）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // または ANON_KEY
);

export async function POST() {
  try {
    console.log("Starting Stripe session creation for /demo...");

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
      // 移動後の /demo に戻すよう修正
      success_url: 'https://direct-cheers.com/demo',
      cancel_url: 'https://direct-cheers.com/demo',
    });

    // StripeのURLへ直接リダイレクト
    return NextResponse.redirect(session.url!, 303);

  } catch (err: any) {
    console.error("Payment API Error:", err.message);
    // 【重要】絶対に /auth/login にリダイレクトさせない
    // エラーが起きても /demo に戻す（クエリでエラーを把握可能にする）
    return NextResponse.redirect(`https://direct-cheers.com/demo?error=${encodeURIComponent(err.message)}`, 303);
  }
}