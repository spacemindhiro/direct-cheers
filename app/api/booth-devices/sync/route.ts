import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

// 子機のQR切替（pushQR）と連動して、NFCタグのリダイレクト先を更新する
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("profile_id", user.id).single();
  if (!profile || !["organizer", "agent", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { device_code, event_id, qr_config_id } = body as {
    device_code?: string;
    event_id?: string;
    qr_config_id?: string;
  };
  if (!device_code) return NextResponse.json({ error: "device_code required" }, { status: 400 });

  // ペアリング未登録のdevice_codeは0件更新で正常終了（キオスク側の動作には影響させない）
  const { error } = await admin
    .from("booth_devices")
    .update({
      current_event_id: event_id ?? null,
      current_qr_config_id: qr_config_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("device_code", device_code);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
