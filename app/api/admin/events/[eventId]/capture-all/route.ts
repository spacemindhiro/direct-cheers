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
  let skipped = 0;
  let errors = 0;
  const errorDetails: { pi_id: string; error: string }[] = [];

  for (const tx of txs ?? []) {
    let piId = tx.stripe_payment_intent_id as string;
    if (piId?.startsWith("{")) {
      try { const p = JSON.parse(piId); if (p?.id) piId = p.id; } catch {}
    }
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);

      if (pi.status === "succeeded") {
        skipped++;
        console.log(`[capture-all] skip (already captured) pi=${piId}`);
        continue;
      }
      if (pi.status !== "requires_capture") {
        errors++;
        errorDetails.push({ pi_id: piId, error: `キャプチャ不可: status=${pi.status}` });
        console.error(`[capture-all] uncapturable pi=${piId} status=${pi.status}`);
        continue;
      }

      await stripe.paymentIntents.capture(piId);
      captured++;
      console.log(`[capture-all] captured pi=${piId}`);
    } catch (err: any) {
      errors++;
      errorDetails.push({ pi_id: piId, error: err.message });
      console.error(`[capture-all] failed pi=${piId}:`, err.message);
    }
  }

  return NextResponse.json({ success: true, captured, skipped, errors, errorDetails });
}
