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

  // 機材マスタに存在するIDなら、表示名はマスタを正としてキャッシュし、last_seenを更新する。
  // マスタに無いID（旧・名前ハッシュ由来のIDを持つ移行前クライアント）は従来どおり
  // クライアント申告の device_name を使う。
  let resolvedName: string | null = device_name ?? null;
  const { data: master } = await admin
    .from("equipment_devices")
    .select("device_id, display_name")
    .eq("device_id", device_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (master) {
    resolvedName = master.display_name;
    await admin.from("equipment_devices").update({ last_seen_at: now }).eq("device_id", device_id);
  }

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
      .update({ device_name: resolvedName, last_seen_at: now })
      .eq("event_id", eventId)
      .eq("device_id", device_id);
    trackId = existing.track_id;
  } else {
    await admin
      .from("display_devices")
      .insert({ event_id: eventId, device_id, device_name: resolvedName, last_seen_at: now, track_id: null });
    trackId = null;
  }

  // トラックのデフォルト表示(単一QR or 名前付きグループ、どちらか一方)を解決する
  let defaultTarget: unknown = null;
  if (trackId) {
    const { data: track } = await admin
      .from("display_tracks")
      // ネストしたto-many埋め込み(members)があると型推論がouterをも配列とみなすため、
      // このクエリ結果はanyで受ける
      .select(`
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
      .eq("track_id", trackId)
      .maybeSingle();

    const t = track as any;
    if (t?.default_qr_group) {
      defaultTarget = {
        type: "group",
        qr_group: {
          qr_group_id: t.default_qr_group.qr_group_id,
          name: t.default_qr_group.name,
          members: [...(t.default_qr_group.members ?? [])]
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((row: any) => row.qr_config),
        },
      };
    } else if (t?.default_qr_config) {
      defaultTarget = { type: "single", qr_config: t.default_qr_config };
    }
  }

  return NextResponse.json({ track_id: trackId, default_target: defaultTarget });
}
