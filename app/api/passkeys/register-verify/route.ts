import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";

const RP_ID = process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID ?? "localhost";
const ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export async function POST(req: Request) {
  const { email, credential } = await req.json() as {
    email: string;
    credential: RegistrationResponseJSON;
  };

  if (!email || !credential) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // チャレンジを取得（clientDataJSON からデコード）
  const clientData = JSON.parse(
    Buffer.from(credential.response.clientDataJSON, "base64url").toString("utf-8")
  );
  const challenge = clientData.challenge;

  const { data: challengeRow } = await admin
    .from("passkey_challenges")
    .select("challenge_id, expires_at")
    .eq("challenge", challenge)
    .eq("purpose", "registration")
    .maybeSingle();

  if (!challengeRow) {
    return NextResponse.json({ error: "Invalid challenge" }, { status: 400 });
  }
  if (new Date(challengeRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }

  // provisional_user チェック
  const { data: provisional } = await admin
    .from("provisional_users")
    .select("provisional_id, profile_id")
    .eq("email", email)
    .maybeSingle();

  if (!provisional) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  // WebAuthn 検証
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

  // 使用済みチャレンジを削除
  await admin
    .from("passkey_challenges")
    .delete()
    .eq("challenge_id", challengeRow.challenge_id);

  // Supabase auth ユーザーを作成 or 既存取得
  let authUserId: string;
  if (provisional.profile_id) {
    // すでに profile がある場合はその auth user を使う
    const { data: profile } = await admin
      .from("profiles")
      .select("profile_id")
      .eq("profile_id", provisional.profile_id)
      .single();
    authUserId = profile!.profile_id;
  } else {
    // 新規 auth ユーザーを作成
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { source: "passkey_registration" },
    });
    if (createErr || !newUser.user) {
      return NextResponse.json({ error: createErr?.message ?? "User creation failed" }, { status: 500 });
    }
    authUserId = newUser.user.id;

    // profiles レコードを作成（fan ロール）
    const { error: profileErr } = await admin.from("profiles").insert({
      profile_id: authUserId,
      role: "fan",
      status: "active",
    });
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    // provisional_user を本登録に昇格
    await admin
      .from("provisional_users")
      .update({ profile_id: authUserId, converted_at: new Date().toISOString() })
      .eq("provisional_id", provisional.provisional_id);
  }

  // passkey_credentials に保存
  const { error: credErr } = await admin.from("passkey_credentials").insert({
    credential_id: cred.id,
    profile_id: authUserId,
    public_key: Buffer.from(cred.publicKey),
    counter: cred.counter,
    device_type: verification.registrationInfo.credentialDeviceType,
    backed_up: verification.registrationInfo.credentialBackedUp,
    transports: credential.response.transports ?? [],
  });

  if (credErr) {
    return NextResponse.json({ error: credErr.message }, { status: 500 });
  }

  // マジックリンクトークンを生成（メール送信なし、クライアントでセッション確立に使用）
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "/" },
  });

  if (linkErr || !linkData?.properties?.hashed_token) {
    // セッション確立に失敗しても登録自体は成功
    return NextResponse.json({ success: true, session_token: null });
  }

  return NextResponse.json({
    success: true,
    session_token: linkData.properties.hashed_token,
  });
}
