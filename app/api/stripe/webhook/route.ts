import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    // Stripe Connect オンボーディング完了
    case "account.updated": {
      const account = event.data.object as Stripe.Account;

      // charges_enabled になったタイミングで pending_interview へ
      if (account.charges_enabled) {
        const { error } = await admin
          .from("profiles")
          .update({ status: "pending_interview" })
          .eq("stripe_connect_id", account.id)
          .eq("status", "pending_onboarding"); // 二重遷移防止

        if (error) {
          console.error("[webhook] profile update failed:", error.message);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
      break;
    }

    default:
      // 未処理イベントは無視
      break;
  }

  return NextResponse.json({ received: true });
}
