import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 未ログインユーザーも招待内容を確認できるよう public エンドポイントとして提供
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: invitation } = await admin
    .from("invitations")
    .select(
      `
      invitation_id,
      target_role,
      status,
      expires_at,
      invited_by:profiles!invited_by_profile_id ( display_name )
    `,
    )
    .eq("token", token)
    .is("deleted_at", null)
    .single();

  if (!invitation) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(invitation);
}

// 招待の論理削除
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("invitations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("token", token)
    .eq("invited_by_profile_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// is_sent フラグ更新
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { is_sent } = await req.json() as { is_sent: boolean };

  const admin = createAdminClient();
  const { error } = await admin
    .from("invitations")
    .update({ is_sent })
    .eq("token", token)
    .eq("invited_by_profile_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
