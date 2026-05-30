import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  try {
    const setupIntent = await stripe.setupIntents.create({
      payment_method_types: ["card"],
      usage: "on_session",
    });
    return NextResponse.json({ client_secret: setupIntent.client_secret });
  } catch (err: any) {
    console.error("[link-setup] Stripe error:", err?.message);
    return NextResponse.json({ error: err?.message ?? "Stripe error" }, { status: 500 });
  }
}
