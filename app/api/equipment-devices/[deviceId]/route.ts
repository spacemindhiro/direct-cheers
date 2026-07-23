import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

async function canManage(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("role").eq("profile_id", userId).single();
  return !!data && ["organizer", "agent", "admin"].includes(data.role);
}

// 機材名の変更（親機・子機どちらからも呼ばれる。IDは不変のまま表示名だけ更新）
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const displayName = (body.display_name as string | undefined)?.trim();
  if (!displayName) return NextResponse.json({ error: "display_name required" }, { status: 400 });

  const { data, error } = await admin
    .from("equipment_devices")
    .update({ display_name: displayName })
    .eq("device_id", deviceId)
    .is("deleted_at", null)
    .select("device_id, display_name")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "同じ機材名が既に存在します" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// 機材の削除（論理削除。誤登録・廃棄機材の掃除用）
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const allowed = await canManage(admin, user.id);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { error } = await admin
    .from("equipment_devices")
    .update({ deleted_at: new Date().toISOString() })
    .eq("device_id", deviceId)
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
