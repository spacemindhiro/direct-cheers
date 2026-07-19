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

  const { data: event } = await admin
    .from("events").select("lifecycle_status").eq("event_id", eventId).single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.lifecycle_status === "settled")
    return NextResponse.json({ error: "精算済みのイベントは返金できません" }, { status: 400 });

  const { data: qrConfigs } = await admin
    .from("qr_configs").select("qr_config_id").eq("event_id", eventId).is("deleted_at", null);
  const qrIds = (qrConfigs ?? []).map((q) => q.qr_config_id);
  if (qrIds.length === 0) return NextResponse.json({ refunded: 0, errors: 0 });

  const { data: txs } = await admin
    .from("transactions")
    .select("transaction_id, stripe_payment_intent_id")
    .in("qr_config_id", qrIds)
    .eq("status", "completed");

  // ウェルカムチアにより同一PIに複数transaction行（1階・2階）が紐づくことがあるため、
  // Stripe側の操作（cancel/refund）はPI単位で1回だけ行い、DBステータス更新は
  // 同じPIを持つ全transaction行に反映する。
  const txsByPi = new Map<string, string[]>();
  for (const tx of txs ?? []) {
    const piId = tx.stripe_payment_intent_id as string;
    txsByPi.set(piId, [...(txsByPi.get(piId) ?? []), tx.transaction_id]);
  }

  let refunded = 0;
  let errors = 0;
  for (const [piId, txIds] of txsByPi.entries()) {
    try {
      // capture_method:manual のためsettle前は大半がrequires_capture(未キャプチャ)。
      // 未キャプチャのPIはrefunds.createでは返金できない(Stripe側でエラーになる)ため、
      // まずcancelで資金移動ゼロのまま解放し、既にキャプチャ済みの場合のみrefundする。
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.status === "requires_capture") {
        await stripe.paymentIntents.cancel(piId);
        await admin
          .from("transactions")
          .update({ status: "cancelled" })
          .in("transaction_id", txIds);
      } else {
        await stripe.refunds.create({ payment_intent: piId });
        await admin
          .from("transactions")
          .update({ status: "refunded" })
          .in("transaction_id", txIds);
      }
      refunded++;
    } catch (err: any) {
      errors++;
      console.error(`[refund-all] PI ${piId}:`, err.message);
    }
  }

  // イベントをキャンセル済みに更新
  if (errors === 0) {
    await admin
      .from("events")
      .update({ lifecycle_status: "cancelled" })
      .eq("event_id", eventId);
  }

  return NextResponse.json({ success: true, refunded, errors });
}
