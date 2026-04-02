import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}') {
    return NextResponse.json({ error: "Invalid Session ID" }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    // @ts-ignore
    apiVersion: '2023-10-16',
  });

  try {
    // ⚡️ expand を使って、顧客情報まで深く掘り下げて取得する
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'payment_intent'],
    });

    // 探す優先順位: 1. 直接の入力値 -> 2. 紐付いた顧客データ -> 3. 支払い詳細
    const email = 
      session.customer_details?.email || 
      (session.customer as Stripe.Customer)?.email || 
      session.customer_email;
    
    if (!email) {
      // ⚡️ 最終手段：紐付いている Customer ID から直接引き直す
      if (typeof session.customer === 'string') {
        const customer = await stripe.customers.retrieve(session.customer);
        if ('email' in customer && customer.email) {
          return NextResponse.json({ email: customer.email });
        }
      }
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    return NextResponse.json({ email });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}