import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: Request) {
  try {
    const { amount, artistId, metadata } = await req.json(); // フロントから送られてくる値
    const stripeKey = process.env.STRIPE_SECRET_KEY || "";
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://direct-cheers.com';

    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is missing");
    
    const stripe = new Stripe(stripeKey, {
      // @ts-ignore
      apiVersion: '2023-10-16',
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: { 
            name: `${artistId} への応援`,
            description: metadata?.comment || ''
          },
          unit_amount: amount, // フロントから届いた金額 (1000, 3000, 5000)
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}/demo/thanks`,
      cancel_url: `${baseUrl}/demo/cheers`,
      metadata: {
        artistId,
        ...metadata
      }
    });

    // --- ✅ 修正：リダイレクトではなく、URLをJSONで返す ---
    return NextResponse.json({ url: session.url });

  } catch (err: any) {
    console.error("Stripe Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}