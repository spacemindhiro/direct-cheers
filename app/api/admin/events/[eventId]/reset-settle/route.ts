import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (me?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: event } = await admin
    .from("events")
    .select("event_id, lifecycle_status")
    .eq("event_id", eventId)
    .single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // イベントを ended に戻す
  await admin
    .from("events")
    .update({ lifecycle_status: "ended", reconciled_at: null })
    .eq("event_id", eventId);

  // settlement_summary を削除
  await admin
    .from("settlement_summaries")
    .delete()
    .eq("event_id", eventId);

  // settle_transfers を削除
  await admin
    .from("settle_transfers")
    .delete()
    .eq("event_id", eventId);

  // このイベントの qr_config_id を取得
  const { data: qrConfigs } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("event_id", eventId);
  const qrIds = (qrConfigs ?? []).map((q) => q.qr_config_id);

  // トランザクションの照合フィールドをリセット
  if (qrIds.length > 0) {
    await admin
      .from("transactions")
      .update({
        amount_verified: null,
        amount_mismatch: null,
        stripe_fee_actual: null,
        stripe_net_actual: null,
        reconciled_at: null,
        reconcile_error: null,
      })
      .in("qr_config_id", qrIds)
      .eq("status", "completed");
  }

  console.log(`[reset-settle] event=${eventId} reset to ended by admin=${user.id}`);

  return NextResponse.json({ success: true, event_id: eventId, reset_to: "ended" });
}
