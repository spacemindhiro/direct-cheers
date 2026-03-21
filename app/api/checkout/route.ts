import { NextResponse } from 'next/server';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// 共通の決済ロジック
async function createCheckoutSession(origin: string) {
  return await stripe.checkout.sessions.create({
    payment_method_types: ['card', 'paypay'],
    line_items: [{
      price_data: {
        currency: 'jpy',
        product_data: { name: '🔥 Direct Cheers (Demo)' },
        unit_amount: 100,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${origin}/?success=true`,
    cancel_url: `${origin}/`,
  });
}

// POSTリクエスト（通常用）
export async function POST(request: Request) {
  try {
    const { origin } = new URL(request.url);
    const session = await createCheckoutSession(origin);
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GETリクエスト（Safariのお節介対策） ★ここを追加！
export async function GET(request: Request) {
  try {
    const { origin } = new URL(request.url);
    const session = await createCheckoutSession(origin);
    // GETの場合はJSONではなく、直接Stripeへリダイレクトさせてしまう
    return NextResponse.redirect(session.url, 303);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}