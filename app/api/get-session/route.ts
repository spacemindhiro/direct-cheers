import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  // IDが不正なら即座に 400 を返す
  if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}' || !sessionId.startsWith('cs_')) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // APIキーのチェック
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return NextResponse.json({ error: "Secret Key Missing" }, { status: 500 });
  }

  const stripe = new Stripe(key, {
    // @ts-ignore
    apiVersion: '2023-10-16',
  });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer'],
    });

    const email = 
      session.customer_details?.email || 
      (session.customer as any)?.email || 
      session.customer_email;

    return NextResponse.json({ email: email || null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}