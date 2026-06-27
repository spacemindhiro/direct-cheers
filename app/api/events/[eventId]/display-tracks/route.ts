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

// トラック一覧取得
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
    .from("display_tracks")
    .select(`
      track_id, name, default_qr_config_id, sort_order,
      default_qr_config:qr_configs!default_qr_config_id(
        qr_config_id, label, image_url,
        product:products!product_id(name, type, artist:profiles!artist_id(display_name))
      )
    `)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// トラック作成
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
  const { name, default_qr_config_id } = body;

  if (!name) return NextResponse.json({ error: "name は必須です" }, { status: 400 });

  const { data, error } = await admin
    .from("display_tracks")
    .insert({ event_id: eventId, name, default_qr_config_id: default_qr_config_id ?? null })
    .select("track_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// トラック更新（名前・デフォルトQR）
export async function PATCH(
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
  const { track_id, name, default_qr_config_id } = body;
  if (!track_id) return NextResponse.json({ error: "track_id required" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (default_qr_config_id !== undefined) update.default_qr_config_id = default_qr_config_id;

  const { error } = await admin
    .from("display_tracks")
    .update(update)
    .eq("track_id", track_id)
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// トラック削除（soft delete）＋ 紐づくスケジュール・デバイスのtrack_idをnullに戻す
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, eventId, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const trackId = searchParams.get("track_id");
  if (!trackId) return NextResponse.json({ error: "track_id required" }, { status: 400 });

  const { error } = await admin
    .from("display_tracks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("track_id", trackId)
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin
    .from("display_schedules")
    .update({ track_id: null })
    .eq("track_id", trackId)
    .eq("event_id", eventId);

  await admin
    .from("display_devices")
    .update({ track_id: null })
    .eq("track_id", trackId)
    .eq("event_id", eventId);

  return NextResponse.json({ ok: true });
}
