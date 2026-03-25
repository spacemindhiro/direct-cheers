import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export async function POST() {
  try {
    // 1. 環境変数の存在チェック（ビルド時ではなく実行時に評価）
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!stripeKey || !supabaseUrl || !supabaseKey) {
      throw new Error("Missing environment variables");
    }

    // 2. Stripe初期化
    const stripe = new Stripe(stripeKey, {
      // @ts-ignore
      apiVersion: '2023-10-16',
    });

    // 3. Supabase初期化（Cookieに依存しない独立したクライアント）
    // これにより、ログイン状態に関わらず実行可能になります
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Stripe Checkout Session creating...");

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

    if (!session.url) throw new Error("Failed to create Stripe session URL");

    // 4. URLをJSONで返し、クライアントサイドで遷移させる
    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    console.error("Payment API Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}