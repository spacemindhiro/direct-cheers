import { NextResponse } from 'next/server';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }

async function handle(req: Request) {
  try {
    const { origin } = new URL(req.url);
    const session = await stripe.checkout.sessions.create({
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
    // SafariのURL直打ちなら303、fetchならJSONを返す
    if (req.method === 'GET') return NextResponse.redirect(session.url, 303);
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}