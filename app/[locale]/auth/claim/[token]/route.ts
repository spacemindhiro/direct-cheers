import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findAuthUserIdByEmail } from "@/lib/resolve-profile";

// GET /auth/claim/[token]
//
// レシートメールに載せた決済後アカウント作成リンク。ここを踏んだ人だけが
// そのメールアドレスのアカウントを作れる（メール所有の証明）。
//
// 自前トークン（purchase_claim_tokens・30日・1回のみ）を検証したうえで、
// Supabase の短命リンクをこのリクエスト内で発行(generateLink)→即検証(verifyOtp)
// してセッションを張る。Supabase の OTP は otp_expiry=3600秒で翌日開く客には
// 間に合わないため、長寿命は自前・短寿命はクリック時生成の二段構え
// （app/api/invitations/[token]/claim と同じ）。
//
// セッション確立後は /auth/passkey-setup へ送り、この端末のパスキーを登録させる
// （既にどこかの端末でパスキー登録済みの会員は遷移先へ直行）。
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { origin } = new URL(request.url);
  const admin = createAdminClient();

  const errRedirect = (code: string) =>
    NextResponse.redirect(`${origin}/auth/error?error=${code}`);

  const { data: claim } = await admin
    .from("purchase_claim_tokens")
    .select("token_id, email, redirect_path, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!claim) return errRedirect("claim_invalid");
  if (claim.used_at) return errRedirect("claim_used");
  if (new Date(claim.expires_at) < new Date()) return errRedirect("claim_expired");

  const email = claim.email;
  // 遷移先はサーバー側でしか書かないが、念のためサイト内の相対パスに限定する
  const redirectPath = claim.redirect_path.startsWith("/") && !claim.redirect_path.startsWith("//")
    ? claim.redirect_path
    : "/dashboard/collection";
  const supabase = await createClient();

  // 既にそのアカウントでログイン中ならトークンを消費して先へ進めるだけ
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  const existingUserId = await findAuthUserIdByEmail(admin, email);
  if (currentUser && existingUserId && currentUser.id === existingUserId) {
    await markUsed(admin, claim.token_id);
    return NextResponse.redirect(`${origin}${await destinationFor(admin, existingUserId, redirectPath)}`);
  }

  // auth.users 未作成なら invite（この verifyOtp でメール確認済みのユーザーが作られる）、
  // 既存会員なら magiclink でログインだけさせる
  const linkType = existingUserId ? "magiclink" : "invite";
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: linkType,
    email,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    console.error(`[auth/claim] generateLink失敗: ${linkError?.message ?? "no token"}`);
    return errRedirect("claim_failed");
  }

  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    type: linkType,
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyError || !verifyData.user) {
    console.error(`[auth/claim] verifyOtp失敗: ${verifyError?.message ?? "no user"}`);
    return errRedirect("claim_failed");
  }

  const authUserId = verifyData.user.id;

  // profiles が無ければ作成。新規客は買い手なので status=active
  // （register-verify の旧・新規作成経路と同じ。status は主催者/出演者の審査用で
  // 買い手としての利用は一切見ない）。auth にはいたが profiles が無い（サインアップ
  // 途中で離脱した等）場合は onboarding 前として pending_onboarding。
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("profile_id")
    .eq("profile_id", authUserId)
    .maybeSingle();
  if (!existingProfile) {
    const { error: profileErr } = await admin.from("profiles").insert({
      profile_id: authUserId,
      display_name: email,
      role: "user",
      status: existingUserId ? "pending_onboarding" : "active",
    });
    if (profileErr) {
      console.error(`[auth/claim] profile作成失敗: ${profileErr.message}`);
      return errRedirect("claim_failed");
    }
  }

  // 決済時に作られた provisional_users を本登録に昇格（未昇格の場合のみ）
  await admin
    .from("provisional_users")
    .update({ profile_id: authUserId, converted_at: new Date().toISOString() })
    .eq("email", email)
    .is("profile_id", null);

  await markUsed(admin, claim.token_id);

  return NextResponse.redirect(`${origin}${await destinationFor(admin, authUserId, redirectPath)}`);
}

async function markUsed(admin: ReturnType<typeof createAdminClient>, tokenId: string) {
  await admin
    .from("purchase_claim_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_id", tokenId);
}

// パスキー未登録ならこの端末で登録させてから、登録済みなら直接、遷移先へ
async function destinationFor(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  redirectPath: string,
): Promise<string> {
  const { count } = await admin
    .from("passkey_credentials")
    .select("credential_id", { count: "exact", head: true })
    .eq("profile_id", profileId);
  if (count && count > 0) return redirectPath;
  return `/auth/passkey-setup?redirect=${encodeURIComponent(redirectPath)}`;
}
