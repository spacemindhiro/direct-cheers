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
      track_id, name, sort_order, default_qr_config_id, default_qr_group_id,
      default_qr_config:qr_configs!default_qr_config_id(
        qr_config_id, label, image_url, recipient_profile_id, recipient_name_context,
        product:products!product_id(name, type, artist:profiles!artist_id(display_name, artist_name, avatar_url)),
        recipient:profiles!recipient_profile_id(display_name, avatar_url, artist_name, organizer_name, artist_avatar_url, organizer_avatar_url)
      ),
      default_qr_group:qr_groups!default_qr_group_id(
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
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // qr_group_members はネストしたsort_orderで並べ替え(PostgRESTの埋め込みは順序保証がないため)。
  // ネストしたto-many埋め込みがあると型推論がouterをも配列とみなすため、ここではanyで受ける
  const normalized = (data ?? []).map((t: any) => ({
    ...t,
    default_qr_group: t.default_qr_group
      ? {
          qr_group_id: t.default_qr_group.qr_group_id,
          name: t.default_qr_group.name,
          members: [...(t.default_qr_group.members ?? [])]
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((row: any) => row.qr_config),
        }
      : null,
  }));

  return NextResponse.json(normalized);
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
  const { name, default_qr_config_id, default_qr_group_id } = body as {
    name?: string;
    default_qr_config_id?: string | null;
    default_qr_group_id?: string | null;
  };

  if (!name) return NextResponse.json({ error: "name は必須です" }, { status: 400 });
  if (default_qr_config_id && default_qr_group_id) {
    return NextResponse.json({ error: "単一QRとグループは同時に指定できません" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("display_tracks")
    .insert({
      event_id: eventId,
      name,
      default_qr_config_id: default_qr_config_id ?? null,
      default_qr_group_id: default_qr_group_id ?? null,
    })
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
  const { track_id, name, default_qr_config_id, default_qr_group_id } = body as {
    track_id?: string;
    name?: string;
    default_qr_config_id?: string | null;
    default_qr_group_id?: string | null;
  };
  if (!track_id) return NextResponse.json({ error: "track_id required" }, { status: 400 });
  if (default_qr_config_id && default_qr_group_id) {
    return NextResponse.json({ error: "単一QRとグループは同時に指定できません" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (default_qr_config_id !== undefined) {
    update.default_qr_config_id = default_qr_config_id;
    if (default_qr_config_id) update.default_qr_group_id = null;
  }
  if (default_qr_group_id !== undefined) {
    update.default_qr_group_id = default_qr_group_id;
    if (default_qr_group_id) update.default_qr_config_id = null;
  }

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
