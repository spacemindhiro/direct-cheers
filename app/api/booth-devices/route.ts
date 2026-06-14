import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

async function canManage(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("role").eq("profile_id", userId).single();
  return !!data && ["organizer", "agent", "admin"].includes(data.role);
}

// ペアリング一覧取得（管理画面用）
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data, error } = await admin
    .from("booth_devices")
    .select(`
      device_code, nfc_routing_id, current_event_id, current_qr_config_id, updated_at,
      event:events!current_event_id(title),
      qr_config:qr_configs!current_qr_config_id(label)
    `)
    .order("device_code", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// ペアリング登録（device_code をキーに upsert）
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { device_code, nfc_routing_id } = body as { device_code?: string; nfc_routing_id?: string };
  if (!device_code) return NextResponse.json({ error: "device_code required" }, { status: 400 });

  const { data, error } = await admin
    .from("booth_devices")
    .upsert(
      { device_code, nfc_routing_id: nfc_routing_id || null, updated_at: new Date().toISOString() },
      { onConflict: "device_code" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
