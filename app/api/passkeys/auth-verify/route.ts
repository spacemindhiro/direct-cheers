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
  function toUint8Array(val: unknown): Uint8Array<ArrayBuffer> {
    if (typeof val === "string") {
      // PostgREST は bytea を \x<hex> 形式で返す
      const raw = val.startsWith("\\x") ? Buffer.from(val.slice(2), "hex") : Buffer.from(val, "base64");
      // 旧バグ: Node.js Buffer.toJSON() が JSON 文字列として格納されてしまった場合の救済
      const str = raw.toString("utf8");
      if (str.startsWith('{"type":"Buffer"')) {
        try {
          const json = JSON.parse(str) as { type: string; data: number[] };
          if (json.type === "Buffer" && Array.isArray(json.data)) {
            return Uint8Array.from(json.data) as Uint8Array<ArrayBuffer>;
          }
        } catch { /* fall through */ }
      }
      return Uint8Array.from(raw) as Uint8Array<ArrayBuffer>;
    }
    if (Buffer.isBuffer(val)) return Uint8Array.from(val) as Uint8Array<ArrayBuffer>;
    if (val instanceof Uint8Array) return Uint8Array.from(val) as Uint8Array<ArrayBuffer>;
    if (Array.isArray(val)) return Uint8Array.from(val as number[]) as Uint8Array<ArrayBuffer>;
    throw new Error(`public_key の型が不明: ${typeof val}`);
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
    console.error("[auth-verify] verifyAuthenticationResponse error:", err.message);
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

  // パスキーログインはそのままステップアップ認証とみなして dc_stepup をセット
  const response = NextResponse.json({
    success: true,
    session_token: linkData.properties.hashed_token,
    email: authUser.user.email,
  });
  response.cookies.set('dc_stepup', Date.now().toString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 480 * 60,
    path: '/',
  });
  return response;
}
