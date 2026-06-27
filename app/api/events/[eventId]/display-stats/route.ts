import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 認証不要 — QR子機画面はパブリック表示
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const admin = createAdminClient();

  const { data: qrConfigs } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("event_id", eventId)
    .is("deleted_at", null);

  const qrConfigIds = (qrConfigs ?? []).map((q) => q.qr_config_id);

  if (qrConfigIds.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  const { count } = await admin
    .from("transactions")
    .select("transaction_id", { count: "exact", head: true })
    .in("qr_config_id", qrConfigIds)
    .eq("status", "completed");

  return NextResponse.json({ count: count ?? 0 });
}
