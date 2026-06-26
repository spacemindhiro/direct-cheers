import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const RP_NAME = "Direct Cheers";

function getRpId(req: Request): string {
  return req.headers.get("host")?.split(":")[0] ?? "localhost";
}

/**
 * ステップアップ画面専用のパスキー新規登録（オプション取得）。
 *
 * /api/passkeys/register-options との違い: あちらはオンボーディング時
 * （未ログイン状態）にも使われるため、クライアントが渡したemailをそのまま
 * 信用する設計になっている。こちらは「すでにログイン中の本人が、今いる
 * この端末を新たに信頼済み端末として追加登録する」という別の文脈のため、
 * 必ず現在のSupabaseセッションからユーザーを解決し、クライアント入力の
 * emailは一切使わない（任意のメールアドレスに対してパスキーを追加登録
 * できてしまう穴を作らないため）。
 */
export async function POST(req: Request) {
  const RP_ID = getRpId(req);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: creds } = await admin
    .from("passkey_credentials")
    .select("credential_id")
    .eq("profile_id", user.id);
  const excludeCredentials = (creds ?? []).map((c) => ({
    id: c.credential_id,
    type: "public-key" as const,
  }));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: user.email,
    userDisplayName: user.email,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
    excludeCredentials,
  });

  const { error: challengeErr } = await admin.from("passkey_challenges").insert({
    challenge: options.challenge,
    profile_id: user.id,
    purpose: "registration",
  });
  if (challengeErr) {
    return NextResponse.json({ error: challengeErr.message }, { status: 500 });
  }

  return NextResponse.json({ options });
}
