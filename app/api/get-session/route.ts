import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId || sessionId.startsWith('{')) {
    return NextResponse.json({ error: "Invalid Session ID" }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    // @ts-ignore
    apiVersion: '2023-10-16',
  });

  try {
    // ⚡️ 深層展開：customerオブジェクトをIDではなく実体として取得
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer'],
    });

    // 取得優先度：セッション直下 > 詳細入力 > 顧客プロファイル
    const email = 
      session.customer_email || 
      session.customer_details?.email || 
      (session.customer as Stripe.Customer)?.email;

    if (!email) {
      return NextResponse.json({ error: "Email data missing in Stripe" }, { status: 404 });
    }

    return NextResponse.json({ email });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}