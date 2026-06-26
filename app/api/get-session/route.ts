import { NextResponse } from 'next/server';
import Stripe from 'stripe';

// /demo/thanks 専用。デモのCheckout Session（app/api/pay/route.tsで
// STRIPE_DEMO_SECRET_KEYを使って作成）を取得するため、同じキーを使う必要がある
// （test/liveモードのデータは完全に分離されており、別モードのキーでは取得できない）。
const stripe = new Stripe(process.env.STRIPE_DEMO_SECRET_KEY || "", {
  // @ts-ignore
  apiVersion: '2023-10-16',
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}' || !sessionId.startsWith('cs_')) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  if (!process.env.STRIPE_DEMO_SECRET_KEY) return NextResponse.json({ error: "Key Missing" }, { status: 500 });

  try {
    // line_itemsやcustomerを含めて取得
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'customer_details'],
    });

    // 💡 あらゆる階層からメアドを探す（優先順位順）
    const email = 
      session.customer_details?.email ||         // 1. 直接の入力値
      (session.customer as any)?.email ||        // 2. 紐付いた顧客データ
      session.customer_email ||                  // 3. セッション作成時の指定
      (session as any).receipt_email;            // 4. レシート用

    console.log("Stripe Session Email Found:", email); // Vercelのログで確認用

    return NextResponse.json({ email: email || null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}