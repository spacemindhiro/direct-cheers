import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

// 子機のQR切替（pushQR）と連動して、NFCタグのリダイレクト先を更新する。
// 新クライアントは device_id（機材マスタID）を送り、その機材が載っている
// ホルダーの現在表示を更新する。
// 旧クライアント（PWAキャッシュで残る）は device_code（端末名）を送るため、
// 移行期間中は同名ホルダーの更新と旧booth_devicesの更新も残す。
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("profile_id", user.id).single();
  if (!profile || !["organizer", "agent", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { device_id, device_code, event_id, qr_config_id } = body as {
    device_id?: string;
    device_code?: string;
    event_id?: string;
    qr_config_id?: string;
  };
  if (!device_id && !device_code) {
    return NextResponse.json({ error: "device_id or device_code required" }, { status: 400 });
  }

  const patch = {
    current_event_id: event_id ?? null,
    current_qr_config_id: qr_config_id ?? null,
  };

  // 新方式: 機材IDが載っているホルダーを更新（未ペアリングなら0件更新で正常終了）
  if (device_id) {
    const { error } = await admin
      .from("booth_holders")
      .update(patch)
      .eq("current_device_id", device_id)
      .is("deleted_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // 旧方式（移行期間の互換）: 端末名と同名のホルダー＋旧booth_devicesを更新
  const { error: holderError } = await admin
    .from("booth_holders")
    .update(patch)
    .eq("name", device_code!)
    .is("deleted_at", null);
  if (holderError) return NextResponse.json({ error: holderError.message }, { status: 500 });

  const { error } = await admin
    .from("booth_devices")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("device_code", device_code!);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
