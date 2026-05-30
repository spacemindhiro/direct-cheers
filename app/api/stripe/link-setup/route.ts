import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body.email;

    let customerId: string | undefined;

    if (email) {
      // 既存 Customer を検索、なければ作成
      const existing = await stripe.customers.list({ email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      } else {
        const customer = await stripe.customers.create({ email });
        customerId = customer.id;
      }

      // provisional_users に stripe_customer_id を保存
      const admin = createAdminClient();
      await admin
        .from("provisional_users")
        .upsert(
          { email, stripe_customer_id: customerId },
          { onConflict: "email", ignoreDuplicates: false }
        );
    }

    const setupIntent = await stripe.setupIntents.create({
      payment_method_types: ["card"],
      usage: "on_session",
      ...(customerId ? { customer: customerId } : {}),
    });

    return NextResponse.json({ client_secret: setupIntent.client_secret });
  } catch (err: any) {
    console.error("[link-setup] Stripe error:", err?.message);
    return NextResponse.json({ error: err?.message ?? "Stripe error" }, { status: 500 });
  }
}
