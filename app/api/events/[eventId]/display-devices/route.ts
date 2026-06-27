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

// 子機一覧取得（コントロールパネル用）
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, eventId, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data, error } = await admin
    .from("display_devices")
    .select("device_id, device_name, track_id, last_seen_at")
    .eq("event_id", eventId)
    .order("last_seen_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// 子機の自己登録（マウント時に呼ばれる）。既存デバイスはtrack_idを保持して更新
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, eventId, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { device_id, device_name } = body;
  if (!device_id) return NextResponse.json({ error: "device_id required" }, { status: 400 });

  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("display_devices")
    .select("track_id")
    .eq("event_id", eventId)
    .eq("device_id", device_id)
    .maybeSingle();

  let trackId: string | null;
  if (existing) {
    await admin
      .from("display_devices")
      .update({ device_name: device_name ?? null, last_seen_at: now })
      .eq("event_id", eventId)
      .eq("device_id", device_id);
    trackId = existing.track_id;
  } else {
    await admin
      .from("display_devices")
      .insert({ event_id: eventId, device_id, device_name: device_name ?? null, last_seen_at: now, track_id: null });
    trackId = null;
  }

  let defaultQrConfig = null;
  if (trackId) {
    const { data: track } = await admin
      .from("display_tracks")
      .select(`
        default_qr_config:qr_configs!default_qr_config_id(
          qr_config_id, label, image_url,
          product:products!product_id(name, type, artist:profiles!artist_id(display_name))
        )
      `)
      .eq("track_id", trackId)
      .maybeSingle();
    defaultQrConfig = track?.default_qr_config ?? null;
  }

  return NextResponse.json({ track_id: trackId, default_qr_config: defaultQrConfig });
}
