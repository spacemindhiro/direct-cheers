import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

async function canManage(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("role").eq("profile_id", userId).single();
  return !!data && ["organizer", "agent", "admin"].includes(data.role);
}

// ホルダーの更新（名前・NFCタグ・載せる機材の付け替え）
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ holderId: string }> }
) {
  const { holderId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json() as {
    name?: string;
    nfc_routing_id?: string | null;
    current_device_id?: string | null;
    current_qr_config_id?: string | null;
  };

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    patch.name = name;
  }
  if (body.nfc_routing_id !== undefined) {
    patch.nfc_routing_id = body.nfc_routing_id?.trim() || null;
  }
  if (body.current_device_id !== undefined) {
    if (body.current_device_id) {
      const { data: device } = await admin
        .from("equipment_devices")
        .select("device_id")
        .eq("device_id", body.current_device_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!device) return NextResponse.json({ error: "指定された機材が見つかりません" }, { status: 400 });
    }
    patch.current_device_id = body.current_device_id || null;
  }
  // NFC単体設置（機材なしホルダー）用: 飛び先QRを手動指定する。
  // 機材が載っているホルダーは子機の表示同期(sync)が随時上書きするため、
  // 手動指定が意味を持つのは機材なしの間のみ
  if (body.current_qr_config_id !== undefined) {
    if (body.current_qr_config_id) {
      const { data: qrConfig } = await admin
        .from("qr_configs")
        .select("qr_config_id, event_id")
        .eq("qr_config_id", body.current_qr_config_id)
        .maybeSingle();
      if (!qrConfig) return NextResponse.json({ error: "指定されたQRが見つかりません" }, { status: 400 });
      patch.current_qr_config_id = qrConfig.qr_config_id;
      patch.current_event_id = qrConfig.event_id;
    } else {
      patch.current_qr_config_id = null;
      patch.current_event_id = null;
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("booth_holders")
    .update(patch)
    .eq("holder_id", holderId)
    .is("deleted_at", null)
    .select("holder_id, name, nfc_routing_id, current_device_id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "同じホルダー名またはNFCタグIDが既に存在します" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// ホルダーの削除（論理削除）
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ holderId: string }> }
) {
  const { holderId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { error } = await admin
    .from("booth_holders")
    .update({ deleted_at: new Date().toISOString(), nfc_routing_id: null })
    .eq("holder_id", holderId)
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
