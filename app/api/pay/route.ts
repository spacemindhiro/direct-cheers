import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export async function POST() {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY || "";
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is missing");
    
    const stripe = new Stripe(stripeKey, {
      // @ts-ignore
      apiVersion: '2023-10-16',
    });

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
      // --- 💡 遷移先をサンクスページに修正 ---
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://direct-cheers.com'}/demo/thanks`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://direct-cheers.com'}/demo`,
    });

    if (supabaseUrl && supabaseAnonKey) {
      createClient(supabaseUrl, supabaseAnonKey);
    }

    // --- ✅ 修正ポイント：NextResponse.json ではなく redirect を使う ---
    return NextResponse.redirect(session.url!, { status: 303 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}