import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

async function canManage(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("role").eq("profile_id", userId).single();
  return !!data && ["organizer", "agent", "admin"].includes(data.role);
}

// ホルダー一覧（親機コントロールパネル・管理画面用）
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data, error } = await admin
    .from("booth_holders")
    .select(`
      holder_id, name, nfc_routing_id, current_device_id, current_event_id, current_qr_config_id, updated_at,
      device:equipment_devices!current_device_id(device_id, display_name),
      event:events!current_event_id(title),
      qr_config:qr_configs!current_qr_config_id(label)
    `)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// ホルダー新規作成
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const name = (body.name as string | undefined)?.trim();
  const nfcRoutingId = (body.nfc_routing_id as string | undefined)?.trim() || null;
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data, error } = await admin
    .from("booth_holders")
    .insert({ name, nfc_routing_id: nfcRoutingId })
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
