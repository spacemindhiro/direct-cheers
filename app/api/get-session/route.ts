// app/api/get-session/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId) return NextResponse.json({ error: "No session_id" }, { status: 400 });

  // ⚡️ 修正ポイント：apiVersionを最新の型に合わせるか、型をキャストします
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    // @ts-ignore: バージョン不一致による型エラーを抑制
    apiVersion: '2023-10-16', 
  });

  try {
    // Stripeから情報を取得
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    // 決済に使われたメアドを返す
    return NextResponse.json({ email: session.customer_details?.email });
  } catch (err: any) {
    console.error("Session Retrieve Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}