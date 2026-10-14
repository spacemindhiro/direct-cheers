import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { canOperateEvent } from "@/lib/event-operator";

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

  // NFCタグの飛び先＝お客様の支払い先。操作できるイベントのQRにしか向けられない
  // （以前は主催者なら誰でも、任意のQRに向けられた）。QRがあるときはイベントもQRから引く
  let patch: { current_event_id: string | null; current_qr_config_id: string | null } = {
    current_event_id: null,
    current_qr_config_id: null,
  };
  if (qr_config_id) {
    const { data: qrConfig } = await admin
      .from("qr_configs")
      .select("qr_config_id, event_id")
      .eq("qr_config_id", qr_config_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!qrConfig) return NextResponse.json({ error: "指定されたQRが見つかりません" }, { status: 400 });
    // 403 だと子機が再読み込みを繰り返すため（ログイン切れ用の挙動）、409 で返す
    if (!(await canOperateEvent(admin, user.id, profile.role, qrConfig.event_id))) {
      return NextResponse.json({ error: "このイベントのQRには切り替えられません" }, { status: 409 });
    }
    patch = { current_event_id: qrConfig.event_id, current_qr_config_id: qrConfig.qr_config_id };
  } else if (event_id) {
    // QR未表示（イベントだけ）の同期。飛び先は空になるが、どのイベントの機材かは記録する
    if (!(await canOperateEvent(admin, user.id, profile.role, event_id))) {
      return NextResponse.json({ error: "このイベントには切り替えられません" }, { status: 409 });
    }
    patch = { current_event_id: event_id, current_qr_config_id: null };
  }

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
