import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export async function POST() {
  try {
    // 既存の環境変数のみを取得
    const stripeKey = process.env.STRIPE_SECRET_KEY || "";
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    // Stripe初期化
    const stripe = new Stripe(stripeKey, {
      // @ts-ignore
      apiVersion: '2023-10-16',
    });

    // utilsを通さず直接初期化することで、未ログイン時の自動リダイレクトを阻止
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
      success_url: 'https://direct-cheers.com/demo',
      cancel_url: 'https://direct-cheers.com/demo',
    });

    if (!session.url) throw new Error("Stripe session URL is empty");

    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    // Vercel上で変数が読めているか、アラートで確認できるようにする
    const debugInfo = `STRIPE:${!!process.env.STRIPE_SECRET_KEY}, URL:${!!process.env.NEXT_PUBLIC_SUPABASE_URL}, ANON:${!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`;
    return NextResponse.json({ 
      error: `Error: ${err.message} | Debug: ${debugInfo}` 
    }, { status: 500 });
  }
}