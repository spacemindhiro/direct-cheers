import { NextResponse } from 'next/server';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// POSTもGETも、何が来ても決済に飛ばす
async function handle(request: Request) {
  try {
    const { origin } = new URL(request.url);
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

    // Safariならリダイレクト、Chrome(JSON期待)ならURLを返す
    if (request.method === 'GET') {
      return NextResponse.redirect(session.url, 303);
    }
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Fatal Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
// これで405は物理的に出せなくなります