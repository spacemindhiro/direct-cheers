import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

async function canManage(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("role").eq("profile_id", userId).single();
  return !!data && ["organizer", "agent", "admin"].includes(data.role);
}

// 機材マスタ一覧（親機コントロールパネル・管理画面用）
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data, error } = await admin
    .from("equipment_devices")
    .select(`
      device_id, display_name, last_seen_at, created_at,
      owner:profiles!owner_profile_id(display_name)
    `)
    .is("deleted_at", null)
    .order("display_name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
