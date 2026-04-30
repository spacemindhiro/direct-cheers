import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const host = req.headers.get("host") ?? "localhost";
  const RP_ID = host.split(":")[0];
  const ORIGIN = req.headers.get("origin") ?? (RP_ID === "localhost" ? "http://localhost:3000" : `https://${RP_ID}`);
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
    console.error("[auth-verify] challenge not found:", challenge?.slice(0, 20));
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
    console.error("[auth-verify] credential not found:", credential.id?.slice(0, 20));
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  // bytea をPostgresから受け取った形式に応じてUint8Arrayに変換
  // PostgREST は bytea を base64 文字列で返す（\x hex ではない）
  function toUint8Array(val: unknown): Uint8Array<ArrayBuffer> {
    let buf: Buffer;
    if (Buffer.isBuffer(val)) {
      buf = Buffer.from(val); // 独立コピー
    } else if (typeof val === "string") {
      if (val.startsWith("\\x")) {
        buf = Buffer.from(val.slice(2), "hex");
      } else {
        // PostgREST はbase64で返す
        buf = Buffer.from(val, "base64");
      }
    } else if (Array.isArray(val)) {
      buf = Buffer.from(val as number[]);
    } else if (val instanceof Uint8Array) {
      buf = Buffer.from(val);
    } else {
      throw new Error(`public_key の型が不明: ${typeof val}`);
    }
    console.log("[auth-verify] public_key decoded:", buf.length, "bytes, raw type:", typeof val, "raw prefix:", typeof val === "string" ? (val as string).slice(0, 10) : "n/a");
    return Uint8Array.from(buf) as Uint8Array<ArrayBuffer>;
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
        publicKey: toUint8Array(storedCred.public_key),
        counter: storedCred.counter,
        transports: storedCred.transports ?? [],
      },
    });
  } catch (err: any) {
    console.error("[auth-verify] verifyAuthenticationResponse error:", err.message, {
      credentialId: storedCred.credential_id,
      publicKeyType: typeof storedCred.public_key,
      publicKeyValue: JSON.stringify(storedCred.public_key)?.slice(0, 80),
    });
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
