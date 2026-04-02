import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  // セッションIDのバリデーション
  if (!sessionId || sessionId.startsWith('{')) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    // @ts-ignore
    apiVersion: '2023-10-16',
  });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer'],
    });

    // メアドを抽出（優先順位：入力値 > 顧客データ）
    const email = 
      session.customer_details?.email || 
      (session.customer as any)?.email || 
      session.customer_email;

    return NextResponse.json({ email: email || null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}