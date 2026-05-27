import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  const setupIntent = await stripe.setupIntents.create({
    payment_method_types: ["card", "link"],
    usage: "off_session",
  });

  return NextResponse.json({ client_secret: setupIntent.client_secret });
}
