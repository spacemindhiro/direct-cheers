import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Stripeはサーバーサイドでのみ初期化（ビルド時はダミーキーでも通るため外でOK）
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
  // @ts-ignore
  apiVersion: '2023-10-16', 
});

// ビルドエラー回避のため、export const dynamic を追加
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // 【重要】ビルド時のエラーを防ぐため、関数内でクライアントを生成する
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase environment variables are missing.");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    console.log("Stripe POST process started for /demo");

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

    if (!session.url) throw new Error("Stripe URL missing");

    // Safari対策：JSONでURLを返し、フロントの window.location.href で飛ばす
    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    console.error("Critical Stripe Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}