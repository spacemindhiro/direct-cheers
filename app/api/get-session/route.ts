import { NextResponse } from 'next/server';
import Stripe from 'stripe';

// ⚡️ これを追加して、Node.js環境で動くことを明示する
export const runtime = 'nodejs'; 
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  console.log("Fetching Session ID:", sessionId); // ログに出ればAPIは叩かれている

  if (!sessionId || sessionId.startsWith('{')) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // 秘密鍵の存在確認
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("Missing STRIPE_SECRET_KEY");
    return NextResponse.json({ error: "Config Error" }, { status: 500 });
  }

  const stripe = new Stripe(key, {
    apiVersion: '2023-10-16' as any,
  });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer'],
    });

    const email = 
      session.customer_email || 
      session.customer_details?.email || 
      (session.customer as Stripe.Customer)?.email;

    if (!email) {
      return NextResponse.json({ error: "No Email Found" }, { status: 404 });
    }

    return NextResponse.json({ email });
  } catch (err: any) {
    console.error("Stripe API Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}