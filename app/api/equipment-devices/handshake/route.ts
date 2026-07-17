import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

/**
 * 子機の起動時ハンドシェイク。機材マスタと同期し、正準の device_id / display_name を返す。
 *
 * 解決順序（localStorage消失時の自己修復を含む）:
 * 1. device_id が渡され、マスタに存在する → その機材（last_seen_at更新）
 * 2. fallback_name がマスタの表示名に一致 → その機材（旧 ?device_name= URL や
 *    localStorage消失後の復元。名前はUNIQUEなので安全に特定できる）
 * 3. どちらも無い → 新規機材として登録（サーバーがIDを発行）
 *
 * 所有者は当面すべてオーナー（admin）。リクエスト者がadminなら本人、
 * それ以外は最古のadminを所有者にする。
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("profile_id", user.id).single();
  if (!profile || !["organizer", "agent", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { device_id, fallback_name } = body as { device_id?: string | null; fallback_name?: string | null };
  const now = new Date().toISOString();

  // 1. device_id 一致
  if (device_id) {
    const { data: byId } = await admin
      .from("equipment_devices")
      .select("device_id, display_name")
      .eq("device_id", device_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (byId) {
      await admin.from("equipment_devices").update({ last_seen_at: now }).eq("device_id", byId.device_id);
      return NextResponse.json(byId);
    }
  }

  // 2. 表示名一致（自己修復）
  const trimmedName = fallback_name?.trim() || null;
  if (trimmedName) {
    const { data: byName } = await admin
      .from("equipment_devices")
      .select("device_id, display_name")
      .eq("display_name", trimmedName)
      .is("deleted_at", null)
      .maybeSingle();
    if (byName) {
      await admin.from("equipment_devices").update({ last_seen_at: now }).eq("device_id", byName.device_id);
      return NextResponse.json(byName);
    }
  }

  // 3. 新規登録
  let ownerId = user.id;
  if (profile.role !== "admin") {
    const { data: oldestAdmin } = await admin
      .from("profiles")
      .select("profile_id")
      .eq("role", "admin")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (oldestAdmin) ownerId = oldestAdmin.profile_id;
  }

  // 名前未指定なら「端末-XXXX」を採番。UNIQUE衝突時は付番を変えて数回リトライ
  for (let attempt = 0; attempt < 5; attempt++) {
    const name =
      attempt === 0 && trimmedName
        ? trimmedName
        : `端末-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const { data: created, error } = await admin
      .from("equipment_devices")
      .insert({ display_name: name, owner_profile_id: ownerId, last_seen_at: now })
      .select("device_id, display_name")
      .single();
    if (!error && created) return NextResponse.json(created);
    // 23505 = unique_violation。それ以外は即エラー返却
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "機材名の採番に失敗しました" }, { status: 500 });
}
