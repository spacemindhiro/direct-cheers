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

// スケジュール一覧取得（子機側からも呼ばれる）
// ?track_id=<uuid> でトラック指定、未指定なら共通(track_id IS NULL)、?all=1 で全トラック分
export async function GET(
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
  const all = searchParams.get("all");

  let query = admin
    .from("display_schedules")
    .select(`
      schedule_id, qr_config_id, qr_group_id, track_id, start_at, end_at, label, sort_order,
      qr_config:qr_configs!qr_config_id(
        qr_config_id, label, image_url, recipient_profile_id, recipient_name_context,
        product:products!product_id(name, type, artist:profiles!artist_id(display_name, artist_name, avatar_url)),
        recipient:profiles!recipient_profile_id(display_name, avatar_url, artist_name, organizer_name, artist_avatar_url, organizer_avatar_url)
      ),
      qr_group:qr_groups!qr_group_id(
        qr_group_id, name,
        members:qr_group_members(
          qr_config_id, sort_order,
          qr_config:qr_configs!qr_config_id(
            qr_config_id, label, image_url, recipient_profile_id, recipient_name_context,
            product:products!product_id(name, type, artist:profiles!artist_id(display_name, artist_name, avatar_url)),
            recipient:profiles!recipient_profile_id(display_name, avatar_url, artist_name, organizer_name, artist_avatar_url, organizer_avatar_url)
          )
        )
      )
    `)
    .eq("event_id", eventId)
    .is("deleted_at", null);

  if (!all) {
    query = trackId ? query.eq("track_id", trackId) : query.is("track_id", null);
  }

  const { data, error } = await query.order("start_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const normalized = (data ?? []).map((s: any) => ({
    ...s,
    qr_group: s.qr_group
      ? {
          qr_group_id: s.qr_group.qr_group_id,
          name: s.qr_group.name,
          members: [...(s.qr_group.members ?? [])]
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((row: any) => row.qr_config),
        }
      : null,
  }));

  return NextResponse.json(normalized);
}

// スケジュール作成
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
  const { qr_config_id, qr_group_id, track_id, start_at, end_at, label } = body;

  if (!start_at || !end_at) {
    return NextResponse.json({ error: "start_at と end_at は必須です" }, { status: 400 });
  }
  if (new Date(end_at) <= new Date(start_at)) {
    return NextResponse.json({ error: "end_at は start_at より後にしてください" }, { status: 400 });
  }
  if (qr_config_id && qr_group_id) {
    return NextResponse.json({ error: "単一QRとグループは同時に指定できません" }, { status: 400 });
  }

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

  const { data, error } = await admin
    .from("display_schedules")
    .insert({
      event_id: eventId,
      qr_config_id: qr_config_id ?? null,
      qr_group_id: qr_group_id ?? null,
      track_id: track_id ?? null,
      start_at, end_at,
      label: label ?? null,
    })
    .select("schedule_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// スケジュール編集（設定済みスロットの内容を変更）
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
  const { schedule_id, qr_config_id, qr_group_id, start_at, end_at, label } = body;

  if (!schedule_id) return NextResponse.json({ error: "schedule_id required" }, { status: 400 });
  if (!start_at || !end_at) {
    return NextResponse.json({ error: "start_at と end_at は必須です" }, { status: 400 });
  }
  if (new Date(end_at) <= new Date(start_at)) {
    return NextResponse.json({ error: "end_at は start_at より後にしてください" }, { status: 400 });
  }
  if (qr_config_id && qr_group_id) {
    return NextResponse.json({ error: "単一QRとグループは同時に指定できません" }, { status: 400 });
  }

  const { error } = await admin
    .from("display_schedules")
    .update({ qr_config_id: qr_config_id ?? null, qr_group_id: qr_group_id ?? null, start_at, end_at, label: label ?? null })
    .eq("schedule_id", schedule_id)
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// スケジュール削除（soft delete）
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
  const scheduleId = searchParams.get("schedule_id");
  if (!scheduleId) return NextResponse.json({ error: "schedule_id required" }, { status: 400 });

  const { error } = await admin
    .from("display_schedules")
    .update({ deleted_at: new Date().toISOString() })
    .eq("schedule_id", scheduleId)
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
