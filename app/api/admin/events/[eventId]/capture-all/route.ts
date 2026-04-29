import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("role").eq("profile_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: qrConfigs } = await admin
    .from("qr_configs").select("qr_config_id").eq("event_id", eventId).is("deleted_at", null);
  const qrIds = (qrConfigs ?? []).map((q) => q.qr_config_id);
  if (qrIds.length === 0) return NextResponse.json({ captured: 0, errors: 0 });

  const { data: txs } = await admin
    .from("transactions")
    .select("transaction_id, stripe_payment_intent_id")
    .in("qr_config_id", qrIds)
    .eq("status", "completed");

  let captured = 0;
  let errors = 0;
  for (const tx of txs ?? []) {
    try {
      await stripe.paymentIntents.capture(tx.stripe_payment_intent_id);
      captured++;
    } catch (err: any) {
      // already_captured は正常
      if (err.code === "charge_already_captured") { captured++; continue; }
      errors++;
      console.error(`[capture-all] PI ${tx.stripe_payment_intent_id}:`, err.message);
    }
  }

  return NextResponse.json({ success: true, captured, errors });
}
