import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export async function POST() {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY || "";
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    // 1. Stripe初期化 (これさえあれば決済画面へは行ける)
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is missing in Vercel settings");
    
    const stripe = new Stripe(stripeKey, {
      // @ts-ignore
      apiVersion: '2023-10-16',
    });

    // 2. Stripeセッション作成 (DB保存より先に実行して、まず決済画面を出す)
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

    // 3. Supabase初期化 (もしキーがあれば初期化する、なければログを出すだけにする)
    if (supabaseUrl && supabaseAnonKey) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      console.log("Supabase client initialized (Anon)");
    } else {
      console.warn("Supabase skipped due to missing keys (but proceeding with Stripe)");
    }

    // 成功！URLを返す
    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    const debug = `STRIPE:${!!process.env.STRIPE_SECRET_KEY}, URL:${!!process.env.NEXT_PUBLIC_SUPABASE_URL}, ANON:${!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`;
    return NextResponse.json({ 
      error: `API ERROR: ${err.message} | ${debug}` 
    }, { status: 500 });
  }
}