import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/invitations/[token]/claim
// 未登録ユーザー向け（target_emailのみの）招待を、追加のメール往復なしにその場で
// 認証まで完了させる。Supabaseの短命な招待トークンをこのリクエスト内で
// 発行(generateLink)と検証(verifyOtp)まで連続実行することで、招待メール自体
// （当社独自のinvitations.token、30日有効）とは別に、もう一通マジックリンクを
// 送って待たせることを避ける。
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: invitation } = await admin
    .from("invitations")
    .select("target_email, target_profile_id, status, expires_at, deleted_at")
    .eq("token", token)
    .maybeSingle();

  if (!invitation || invitation.deleted_at) {
    return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  }

  if (invitation.status !== "pending" || new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  // 既存ユーザー指名の招待はこのエンドポイントの対象外（通常のログイン導線を使う）
  if (invitation.target_profile_id || !invitation.target_email) {
    return NextResponse.json({ error: "not_email_invite" }, { status: 400 });
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: invitation.target_email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    // 既にそのメールアドレスで確認済みアカウントが存在する等。
    // 通常のログイン導線（/auth/login）へフォールバックさせる。
    return NextResponse.json({ error: "claim_failed" }, { status: 409 });
  }

  const supabase = await createClient();
  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    type: "invite",
    token_hash: linkData.properties.hashed_token,
  });

  if (verifyError || !verifyData.user) {
    return NextResponse.json({ error: "claim_failed" }, { status: 409 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("profile_id")
    .eq("profile_id", verifyData.user.id)
    .maybeSingle();

  const inviteUrl = `/invite/${token}`;
  const redirect = profile
    ? inviteUrl
    : `/onboarding/profile?redirect=${encodeURIComponent(inviteUrl)}`;

  return NextResponse.json({ redirect });
}
