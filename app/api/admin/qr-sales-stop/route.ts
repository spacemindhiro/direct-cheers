import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resumeQrSales, stopQrSales } from "@/lib/qr/sales-stop";

// admin が QR の販売を止める・再開する（不正に気づいたときにその場で止めるため。2026-10-24）。
// qr_config_id で QR 1つ、event_id でそのイベントの QR をまとめて。止めている間は決済の入口がすべて断る。
// 止めた・再開した記録は qr_sales_stop_logs に残る
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("role").eq("profile_id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, qr_config_id, event_id, note } = await req.json() as {
    action?: "stop" | "resume"; qr_config_id?: string; event_id?: string; note?: string | null;
  };
  if (action !== "stop" && action !== "resume") return NextResponse.json({ error: "action は stop か resume です" }, { status: 400 });
  if (!qr_config_id === !event_id) return NextResponse.json({ error: "qr_config_id か event_id のどちらか一方を指定してください" }, { status: 400 });

  const admin = createAdminClient();
  const query = admin.from("qr_configs").select("qr_config_id").is("deleted_at", null);
  const { data: qrs } = qr_config_id ? await query.eq("qr_config_id", qr_config_id) : await query.eq("event_id", event_id!);
  const ids = (qrs ?? []).map((q) => q.qr_config_id as string);
  if (ids.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const changed = action === "stop"
    ? await stopQrSales(admin, ids, { reason: "admin", actorId: user.id, note: note ?? null })
    : await resumeQrSales(admin, ids, { actorId: user.id, note: note ?? null });
  return NextResponse.json({ ok: true, changed: changed.length });
}
