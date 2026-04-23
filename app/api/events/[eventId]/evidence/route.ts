import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await supabase
    .from("events")
    .select("event_id, title, organizer_profile_id, end_at, lifecycle_status, agent_id")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.organizer_profile_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const eventEnded = new Date(event.end_at) < new Date() || event.lifecycle_status === "ended";
  if (!eventEnded)
    return NextResponse.json({ error: "Event has not ended yet" }, { status: 400 });

  const { description, photo_paths, attendance_count } = await req.json() as {
    description?: string;
    photo_paths: string[];
    attendance_count?: number;
  };

  const { data, error } = await admin
    .from("event_evidences")
    .insert({
      event_id: eventId,
      submitted_by: user.id,
      description: description ?? null,
      photo_paths: photo_paths ?? [],
      attendance_count: attendance_count ?? null,
    })
    .select("evidence_id")
    .single();

  if (error) {
    console.error("[evidence/POST] insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 再提出時に差戻しサマリーをリセット（承認待ち状態に戻す）
  await admin
    .from("settlement_summaries")
    .delete()
    .eq("event_id", eventId)
    .eq("is_approved_for_payout", false);

  // 差戻し通知を既読化
  await admin
    .from("notifications")
    .update({ is_read: true })
    .eq("profile_id", user.id)
    .eq("type", "evidence_rejected")
    .eq("is_read", false)
    .filter("metadata->>event_id", "eq", eventId);

  // admin に通知
  try {
    const { data: admins } = await admin
      .from("profiles")
      .select("profile_id")
      .eq("role", "admin")
      .limit(1);
    const adminId = admins?.[0]?.profile_id ?? null;

    const { data: organizer } = await admin
      .from("profiles")
      .select("display_name")
      .eq("profile_id", user.id)
      .single();

    if (adminId) {
      await admin.from("notifications").insert({
        profile_id: adminId,
        type: "evidence_submitted",
        title: "証跡提出 — 精算承認待ち",
        body: `「${event.title}」の開催証跡が提出されました。精算管理から確認してください。`,
        metadata: { event_id: eventId, submitted_by: user.id, organizer_name: organizer?.display_name ?? null },
      });
    }
  } catch { /* 通知失敗は無視 */ }

  return NextResponse.json({ evidence_id: data.evidence_id });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("event_evidences")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ evidences: data ?? [] });
}
