import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STEP_UP_MAX_AGE = 480 * 60; // 480分（秒単位）。dashboard layout の STEP_UP_TTL_MS と一致させる

function getRpIdAndOrigin(req: Request): { rpId: string; origin: string } {
  const host = req.headers.get("host") ?? "localhost";
  const rpId = host.split(":")[0];
  const origin = req.headers.get("origin") ?? (rpId === "localhost" ? "http://localhost:3000" : `https://${rpId}`);
  return { rpId, origin };
}

/**
 * ステップアップ画面専用のパスキー新規登録（検証）。
 *
 * 新しい端末でログインした既存ユーザーが、別の端末で登録したパスキーを
 * 持っていないためステップアップ認証に詰まる問題への対処。今まさに
 * マジックリンク等でログイン済み（=メール所有権の確認は済んでいる）という
 * 事実を根拠に、その場でこの端末用のパスキーを追加登録できるようにする。
 * 成功時は dc_stepup クッキーもセットし、ステップアップ自体も完了させる
 * （/api/passkeys/stepup-verify と同じクッキー設定ロジック）。
 */
export async function POST(req: Request) {
  const { rpId: RP_ID, origin: ORIGIN } = getRpIdAndOrigin(req);
  const { credential, device_name } = await req.json() as {
    credential: RegistrationResponseJSON;
    device_name?: string;
  };

  if (!credential) {
    return NextResponse.json({ error: "Missing credential" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const clientData = JSON.parse(
    Buffer.from(credential.response.clientDataJSON, "base64url").toString("utf-8")
  );
  const challenge = clientData.challenge;

  const { data: challengeRow } = await admin
    .from("passkey_challenges")
    .select("challenge_id, expires_at, profile_id")
    .eq("challenge", challenge)
    .eq("purpose", "registration")
    .maybeSingle();

  if (!challengeRow) {
    return NextResponse.json({ error: "Invalid challenge" }, { status: 400 });
  }
  if (new Date(challengeRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }
  // チャレンジ発行時のユーザーと、検証時のセッションユーザーが一致することを確認
  if (challengeRow.profile_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  const { credential: cred } = verification.registrationInfo;

  await admin.from("passkey_challenges").delete().eq("challenge_id", challengeRow.challenge_id);

  const { error: credErr } = await admin.from("passkey_credentials").upsert({
    credential_id: cred.id,
    profile_id: user.id,
    public_key: "\\x" + Buffer.from(cred.publicKey).toString("hex"),
    counter: cred.counter,
    device_type: verification.registrationInfo.credentialDeviceType,
    backed_up: verification.registrationInfo.credentialBackedUp,
    transports: credential.response.transports ?? [],
    device_name: device_name?.trim() || null,
  });

  if (credErr) {
    return NextResponse.json({ error: credErr.message }, { status: 500 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("dc_stepup", Date.now().toString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: STEP_UP_MAX_AGE,
    path: "/",
  });
  return response;
}
