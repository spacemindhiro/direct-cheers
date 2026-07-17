import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 宛先が指定されている場合、ログイン中ユーザーが本人か確認
  const admin = createAdminClient();
  const { data: invitation } = await admin
    .from("invitations")
    .select("target_email, target_profile_id")
    .eq("token", token)
    .single();

  if (invitation?.target_profile_id) {
    // 指名招待は本人のみ受諾可（メール変更後も profile_id 一致で受諾できる）
    if (invitation.target_profile_id !== user.id) {
      return NextResponse.json({ error: "wrong_recipient" }, { status: 403 });
    }
  } else if (invitation?.target_email && invitation.target_email !== user.email) {
    return NextResponse.json({ error: "email_mismatch" }, { status: 403 });
  }

  // security definer RPC でトランザクション実行（RLS バイパス）
  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
    p_user_id: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.error) {
    const statusMap: Record<string, number> = {
      invalid_token: 404,
      self_accept: 400,
      wrong_recipient: 403,
    };
    return NextResponse.json(
      { error: data.error },
      { status: statusMap[data.error] ?? 400 },
    );
  }

  return NextResponse.json({ success: true, role: data.role });
}
