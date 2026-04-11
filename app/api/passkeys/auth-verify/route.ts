import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";

const RP_ID = process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID ?? "localhost";
const ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export async function POST(req: Request) {
  const { credential } = await req.json() as {
    credential: AuthenticationResponseJSON;
  };

  if (!credential) {
    return NextResponse.json({ error: "Missing credential" }, { status: 400 });
  }

  const admin = createAdminClient();

  // clientDataJSON からチャレンジを取得
  const clientData = JSON.parse(
    Buffer.from(credential.response.clientDataJSON, "base64url").toString("utf-8")
  );
  const challenge = clientData.challenge;

  const { data: challengeRow } = await admin
    .from("passkey_challenges")
    .select("challenge_id, expires_at")
    .eq("challenge", challenge)
    .eq("purpose", "authentication")
    .maybeSingle();

  if (!challengeRow) {
    return NextResponse.json({ error: "Invalid challenge" }, { status: 400 });
  }
  if (new Date(challengeRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }

  // クレデンシャルを取得
  const { data: storedCred } = await admin
    .from("passkey_credentials")
    .select("credential_id, profile_id, public_key, counter, transports")
    .eq("credential_id", credential.id)
    .maybeSingle();

  if (!storedCred) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  // WebAuthn 検証
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: storedCred.credential_id,
        publicKey: new Uint8Array(storedCred.public_key as unknown as Buffer),
        counter: storedCred.counter,
        transports: storedCred.transports ?? [],
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  // カウンターを更新
  await admin
    .from("passkey_credentials")
    .update({
      counter: verification.authenticationInfo.newCounter,
      updated_at: new Date().toISOString(),
    })
    .eq("credential_id", storedCred.credential_id);

  // チャレンジを削除
  await admin
    .from("passkey_challenges")
    .delete()
    .eq("challenge_id", challengeRow.challenge_id);

  // profile の email を取得
  const { data: authUser } = await admin.auth.admin.getUserById(storedCred.profile_id);
  if (!authUser?.user?.email) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // マジックリンクトークンを生成（セッション確立用）
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: authUser.user.email,
    options: { redirectTo: "/" },
  });

  if (linkErr || !linkData?.properties?.hashed_token) {
    return NextResponse.json({ error: "Session creation failed" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    session_token: linkData.properties.hashed_token,
    email: authUser.user.email,
  });
}
