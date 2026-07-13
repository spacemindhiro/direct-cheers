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

// QRグループ一覧取得(メンバーのQR情報込み・sort_order順)
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
    .from("qr_groups")
    .select(`
      qr_group_id, name,
      members:qr_group_members(
        qr_config_id, sort_order,
        qr_config:qr_configs!qr_config_id(
          qr_config_id, label, image_url,
          product:products!product_id(name, type, artist:profiles!artist_id(display_name))
        )
      )
    `)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const normalized = (data ?? []).map((g) => ({
    qr_group_id: g.qr_group_id,
    name: g.name,
    members: [...(g.members ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row) => row.qr_config),
  }));

  return NextResponse.json(normalized);
}

// QRグループ作成
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
  const { name, qr_config_ids } = body as { name?: string; qr_config_ids?: string[] };

  if (!name?.trim()) return NextResponse.json({ error: "name は必須です" }, { status: 400 });
  if (!qr_config_ids || qr_config_ids.length < 2) {
    return NextResponse.json({ error: "グループには2件以上のQRが必要です" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("qr_groups")
    .insert({ event_id: eventId, name: name.trim() })
    .select("qr_group_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = qr_config_ids.map((qrConfigId, i) => ({
    qr_group_id: data.qr_group_id,
    qr_config_id: qrConfigId,
    sort_order: i,
  }));
  const { error: memberError } = await admin.from("qr_group_members").insert(rows);
  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}

// QRグループ更新(名前・メンバー構成)
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
  const { qr_group_id, name, qr_config_ids } = body as { qr_group_id?: string; name?: string; qr_config_ids?: string[] };
  if (!qr_group_id) return NextResponse.json({ error: "qr_group_id required" }, { status: 400 });

  if (name !== undefined) {
    if (!name.trim()) return NextResponse.json({ error: "name は空にできません" }, { status: 400 });
    const { error } = await admin
      .from("qr_groups")
      .update({ name: name.trim() })
      .eq("qr_group_id", qr_group_id)
      .eq("event_id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (qr_config_ids !== undefined) {
    if (qr_config_ids.length < 2) {
      return NextResponse.json({ error: "グループには2件以上のQRが必要です" }, { status: 400 });
    }
    const { error: delError } = await admin.from("qr_group_members").delete().eq("qr_group_id", qr_group_id);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

    const rows = qr_config_ids.map((qrConfigId, i) => ({
      qr_group_id,
      qr_config_id: qrConfigId,
      sort_order: i,
    }));
    const { error: insError } = await admin.from("qr_group_members").insert(rows);
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// QRグループ削除(ソフトデリート)。参照中のトラック・スロットはnullに戻す
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
  const qrGroupId = searchParams.get("qr_group_id");
  if (!qrGroupId) return NextResponse.json({ error: "qr_group_id required" }, { status: 400 });

  const { error } = await admin
    .from("qr_groups")
    .update({ deleted_at: new Date().toISOString() })
    .eq("qr_group_id", qrGroupId)
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("display_tracks").update({ default_qr_group_id: null }).eq("default_qr_group_id", qrGroupId);
  await admin.from("display_schedules").update({ qr_group_id: null }).eq("qr_group_id", qrGroupId);

  return NextResponse.json({ ok: true });
}
