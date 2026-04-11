import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// パスキーを削除（自分のものだけ）
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ credentialId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { credentialId } = await params;
  const admin = createAdminClient();

  // 自分のクレデンシャルか確認してから削除
  const { data: cred } = await admin
    .from("passkey_credentials")
    .select("credential_id, profile_id")
    .eq("credential_id", credentialId)
    .maybeSingle();

  if (!cred) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (cred.profile_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // 最後の1件は削除不可（ロックアウト防止）
  const { count } = await admin
    .from("passkey_credentials")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", user.id);

  if ((count ?? 0) <= 1)
    return NextResponse.json(
      { error: "最後のパスキーは削除できません。別のデバイスを追加してから削除してください。" },
      { status: 400 }
    );

  const { error } = await admin
    .from("passkey_credentials")
    .delete()
    .eq("credential_id", credentialId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// device_name を更新
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ credentialId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { credentialId } = await params;
  const { device_name } = await req.json() as { device_name: string };

  if (!device_name?.trim())
    return NextResponse.json({ error: "device_name is required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: cred } = await admin
    .from("passkey_credentials")
    .select("profile_id")
    .eq("credential_id", credentialId)
    .maybeSingle();

  if (!cred || cred.profile_id !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await admin
    .from("passkey_credentials")
    .update({ device_name: device_name.trim() })
    .eq("credential_id", credentialId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
