import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 招待権限マトリクス
const PERMISSION_MATRIX: Record<string, string[]> = {
  admin: ["agent", "organizer", "artist"],
  agent: ["organizer", "artist"],
  organizer: ["artist"],
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = await req.json();
  const { target_role, target_email } = body as {
    target_role: string;
    target_email?: string;
  };

  if (!target_email) {
    return NextResponse.json({ error: "メールアドレスは必須です" }, { status: 400 });
  }

  // 権限チェック
  const allowed = PERMISSION_MATRIX[profile.role] ?? [];
  if (!allowed.includes(target_role)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const admin = createAdminClient();

  // 同一 invited_by + target_email の pending 招待を期限切れに（再送対応）
  if (target_email) {
    await admin
      .from("invitations")
      .update({ status: "expired" })
      .eq("invited_by_profile_id", user.id)
      .eq("target_email", target_email)
      .eq("status", "pending");
  }

  // 新しい招待を発行
  const { data: invitation, error } = await admin
    .from("invitations")
    .insert({
      invited_by_profile_id: user.id,
      target_role,
      target_email: target_email ?? null,
    })
    .select("token")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ token: invitation.token });
}
