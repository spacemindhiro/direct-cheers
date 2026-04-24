import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (me?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { eventId } = await req.json() as { eventId: string };
  if (!eventId)
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });

  // イベントのQR取得
  const { data: qrConfigs } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("event_id", eventId);
  const qrIds = (qrConfigs ?? []).map((q) => q.qr_config_id);
  if (qrIds.length === 0)
    return NextResponse.json({ checked: 0, reconciled: 0, errors: 0 });

  // 未照合トランザクション取得
  const { data: transactions } = await admin
    .from("transactions")
    .select(`
      transaction_id, stripe_payment_intent_id, total_gross_amount, qr_config_id,
      qr_config:qr_configs!qr_config_id(event_id, event:events!event_id(organizer_profile_id)),
      transaction_distributions(transaction_distribution_id, profile_id, actual_amount, distribution_status)
    `)
    .in("qr_config_id", qrIds)
    .eq("status", "completed")
    .is("reconciled_at", null);

  const now = new Date();
  let reconciled = 0;
  let errors = 0;

  for (const tx of transactions ?? []) {
    try {
      const pi = await stripe.paymentIntents.retrieve(tx.stripe_payment_intent_id, {
        expand: ["latest_charge.balance_transaction"],
      });
      const charge = pi.latest_charge as Stripe.Charge | null;
      const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;

      const stripeGross = pi.amount_received ?? 0;
      const stripeFee = bt?.fee ?? null;
      const stripeNet = bt?.net ?? null;
      const grossDiff = stripeGross - (tx.total_gross_amount ?? 0);
      const grossMatch = grossDiff === 0;

      const dists = ((tx.transaction_distributions ?? []) as any[]).filter(
        (d) => d.distribution_status === "accrued"
      );
      const estimatedNet = dists.reduce((s: number, d: any) => s + (d.actual_amount ?? 0), 0);

      if (stripeNet !== null && estimatedNet > 0 && stripeNet !== estimatedNet) {
        const organizerProfileId = (tx.qr_config as any)?.event?.organizer_profile_id ?? null;
        const sortedDists = [...dists].sort((a: any, b: any) => {
          if (b.actual_amount !== a.actual_amount) return b.actual_amount - a.actual_amount;
          return (b.profile_id === organizerProfileId ? 1 : 0) - (a.profile_id === organizerProfileId ? 1 : 0);
        });
        let allocated = 0;
        for (let i = 0; i < sortedDists.length; i++) {
          const d = sortedDists[i] as any;
          const isLast = i === sortedDists.length - 1;
          const adjustedAmount = isLast
            ? stripeNet - allocated
            : Math.floor((d.actual_amount / estimatedNet) * stripeNet);
          await admin
            .from("transaction_distributions")
            .update({ actual_amount: adjustedAmount })
            .eq("transaction_distribution_id", d.transaction_distribution_id);
          allocated += adjustedAmount;
        }
      }

      await admin
        .from("transactions")
        .update({
          amount_verified: grossMatch,
          amount_mismatch: grossDiff,
          stripe_fee_actual: stripeFee,
          stripe_net_actual: stripeNet,
          reconciled_at: now.toISOString(),
          reconcile_error: null,
        })
        .eq("transaction_id", tx.transaction_id);

      reconciled++;
    } catch (err: any) {
      errors++;
      await admin
        .from("transactions")
        .update({ reconcile_error: err.message, reconciled_at: now.toISOString() })
        .eq("transaction_id", tx.transaction_id);
    }
  }

  // 全照合済みならイベントフラグを更新
  const { count: remaining } = await admin
    .from("transactions")
    .select("transaction_id", { count: "exact", head: true })
    .in("qr_config_id", qrIds)
    .eq("status", "completed")
    .is("reconciled_at", null);

  if (remaining === 0 && (transactions ?? []).length > 0) {
    await admin
      .from("events")
      .update({ reconciled_at: now.toISOString() })
      .eq("event_id", eventId)
      .is("reconciled_at", null);
  }

  const checked = (transactions ?? []).length;

  await admin.from("reconciliation_logs").insert({
    run_at: now.toISOString(),
    target_date: now.toISOString().slice(0, 10),
    total_checked: checked,
    total_matched: reconciled - errors,
    total_mismatched: 0,
    total_errors: errors,
    summary: { manual: true, event_id: eventId, event_reconciled: remaining === 0 },
  });

  return NextResponse.json({
    checked,
    reconciled,
    errors,
    event_reconciled: remaining === 0,
  });
}
