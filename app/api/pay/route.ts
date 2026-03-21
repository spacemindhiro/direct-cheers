import { NextResponse } from "next/server";
import Stripe from "stripe";

// apiVersion を削除して最新(default)に任せます
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin") || "https://direct-cheers.com";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "jpy",
            product_data: { name: "応援の気持ち" },
            unit_amount: 100,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}?status=success`,
      cancel_url: `${origin}?status=cancel`,
    });

    if (!session.url) {
      throw new Error("Stripe session URL is missing");
    }

    // Safariのキャッシュを突き破る 303 Redirect
    return NextResponse.redirect(session.url, 303);

  } catch (err: any) {
    console.error("Stripe Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}