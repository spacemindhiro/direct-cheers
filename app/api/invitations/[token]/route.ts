import { NextResponse } from "next/server";
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
