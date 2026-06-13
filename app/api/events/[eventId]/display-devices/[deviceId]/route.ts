import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

async function canManage(admin: ReturnType<typeof createAdminClient>, eventId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from("events")
    .select("organizer_profile_id, agent_id")
    .eq("event_id", eventId)
    .single();
  if (!data) return false;
  if (data.organizer_profile_id === userId || data.agent_id === userId) return true;
  const { data: p } = await admin.from("profiles").select("role").eq("profile_id", userId).single();
  return p?.role === "admin";
}

// 子機のトラック割当変更（コントロールパネルから）
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string; deviceId: string }> }
) {
  const { eventId, deviceId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, eventId, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { track_id } = body;

  if (track_id) {
    const { data: track } = await admin
      .from("display_tracks")
      .select("track_id")
      .eq("track_id", track_id)
      .eq("event_id", eventId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!track) return NextResponse.json({ error: "track_id が不正です" }, { status: 400 });
  }

  const { error } = await admin
    .from("display_devices")
    .update({ track_id: track_id ?? null })
    .eq("event_id", eventId)
    .eq("device_id", deviceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
