import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const AUTH_EXPIRE_DAYS = 7;
const WARN_DAYS_BEFORE = 2;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();

  const { data: events } = await admin
    .from("events")
    .select("event_id, title, start_at, agent_id")
    .in("lifecycle_status", ["ended", "ongoing", "published"])
    .not("agent_id", "is", null);

  let notified = 0;

  for (const event of events ?? []) {
    const startAt = new Date(event.start_at);
    const expiresAt = new Date(startAt.getTime() + AUTH_EXPIRE_DAYS * 24 * 60 * 60 * 1000);
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft > WARN_DAYS_BEFORE) continue;

    const { data: qrConfigs } = await admin
      .from("qr_configs").select("qr_config_id").eq("event_id", event.event_id).is("deleted_at", null);
    const qrIds = (qrConfigs ?? []).map((q) => q.qr_config_id);
    if (qrIds.length === 0) continue;

    const { count } = await admin
      .from("transactions")
      .select("transaction_id", { count: "exact", head: true })
      .in("qr_config_id", qrIds)
      .eq("status", "completed");

    if (!count || count === 0) continue;

    // 重複防止: 同イベントの auth_expiring 通知が既存かチェック
    const { count: existing } = await admin
      .from("notifications")
      .select("notification_id", { count: "exact", head: true })
      .eq("profile_id", event.agent_id)
      .eq("type", "auth_expiring")
      .contains("metadata", { event_id: event.event_id });

    if (existing && existing > 0) continue;

    await admin.from("notifications").insert({
      profile_id: event.agent_id,
      type: "auth_expiring",
      title: "オーソリ期限が迫っています",
      body: `「${event.title}」の売上オーソリ期限まで残り ${daysLeft} 日です。精算を実行してください。`,
      metadata: {
        event_id: event.event_id,
        expires_at: expiresAt.toISOString(),
        days_left: daysLeft,
      },
    });
    notified++;
  }

  return NextResponse.json({ success: true, notified });
}
