import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";

function getRpIdAndOrigin(req: Request): { rpId: string; origin: string } {
  const host = req.headers.get("host") ?? "localhost";
  const rpId = host.split(":")[0];
  const origin = req.headers.get("origin") ?? (rpId === "localhost" ? "http://localhost:3000" : `https://${rpId}`);
  return { rpId, origin };
}

export async function POST(req: Request) {
  const { rpId: RP_ID, origin: ORIGIN } = getRpIdAndOrigin(req);
  const { email, credential, device_name } = await req.json() as {
    email: string;
    credential: RegistrationResponseJSON;
    device_name?: string;
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

  // provisional_users または auth からユーザーを特定
  const { data: provisional } = await admin
    .from("provisional_users")
    .select("provisional_id, profile_id")
    .eq("email", email)
    .maybeSingle();

  // provisional_users にいない場合は auth から直接解決
  let resolvedProfileId: string | null = provisional?.profile_id ?? null;
  if (!resolvedProfileId) {
    const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = users.find(u => u.email === email);
    if (!authUser && !provisional) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }
    resolvedProfileId = authUser?.id ?? null;
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
  if (resolvedProfileId) {
    authUserId = resolvedProfileId;
    // auth.users にはいるが profiles がない場合（onboarding 前の passkey 登録）は profile を作成
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
        status: "pending_onboarding",
      });
      if (profileErr) {
        return NextResponse.json({ error: `profile insert failed: ${profileErr.message}` }, { status: 500 });
      }
    }
  } else {
    // 新規 auth ユーザーを作成（既存の場合は既存ユーザーを使用）
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { source: "passkey_registration" },
    });

    if (createErr) {
      // すでに auth ユーザーが存在する場合は検索して使用
      const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existingUser = users.find(u => u.email === email);
      if (!existingUser) {
        return NextResponse.json({ error: createErr.message }, { status: 500 });
      }
      authUserId = existingUser.id;
    } else if (!newUser.user) {
      return NextResponse.json({ error: "User creation failed" }, { status: 500 });
    } else {
      authUserId = newUser.user.id;

      const { error: profileErr } = await admin.from("profiles").insert({
        profile_id: authUserId,
        display_name: email,
        role: "user",
        status: "active",
      });
      if (profileErr) {
        return NextResponse.json({ error: profileErr.message }, { status: 500 });
      }
    }

    // provisional_user を本登録に昇格（存在する場合のみ）
    if (provisional) {
      await admin
        .from("provisional_users")
        .update({ profile_id: authUserId, converted_at: new Date().toISOString() })
        .eq("provisional_id", provisional.provisional_id);
    }
  }

  // passkey_credentials に保存（同じクレデンシャルの再登録はupsert）
  const { error: credErr } = await admin.from("passkey_credentials").upsert({
    credential_id: cred.id,
    profile_id: authUserId,
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
