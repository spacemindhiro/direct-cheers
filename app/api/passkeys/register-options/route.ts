import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";

const RP_NAME = "Direct Cheers";

function getRpId(req: Request): string {
  return req.headers.get("host")?.split(":")[0] ?? "localhost";
}

export async function POST(req: Request) {
  const RP_ID = getRpId(req);
  const { email, device_name } = await req.json() as { email: string; device_name?: string };

  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const admin = createAdminClient();

  // provisional_users または Supabase auth からユーザーを特定
  const { data: provisional } = await admin
    .from("provisional_users")
    .select("provisional_id, profile_id")
    .eq("email", email)
    .maybeSingle();

  // provisional_users にいない場合は auth ユーザーから profile_id を解決
  let resolvedProfileId: string | null = provisional?.profile_id ?? null;
  if (!resolvedProfileId) {
    const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = users.find(u => u.email === email);
    if (!authUser && !provisional) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }
    resolvedProfileId = authUser?.id ?? null;
  }

  // 既存クレデンシャルを除外リストに
  let excludeCredentials: { id: string; type: "public-key" }[] = [];
  if (resolvedProfileId) {
    const { data: creds } = await admin
      .from("passkey_credentials")
      .select("credential_id")
      .eq("profile_id", resolvedProfileId);
    if (creds) {
      excludeCredentials = creds.map((c) => ({
        id: c.credential_id,
        type: "public-key" as const,
      }));
    }
  }

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: email,
    userDisplayName: email,
    attestationType: "none",
    excludeCredentials,
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });

  // チャレンジを保存（profile_id はまだないかもしれないのでnull許容）
  await admin.from("passkey_challenges").insert({
    challenge: options.challenge,
    profile_id: provisional.profile_id ?? null,
    purpose: "registration",
  });

  // email を challenge と紐づけるため metadata を返す側で渡す
  // challenge 自体に email を含めず、サーバー側で保持
  // → challenges テーブルに email カラムがないので session として返す
  // シンプルに: email を暗号化してオプションに含める代わりに
  // challenge_id ベースで検索可能にする（challenge は unique）

  return NextResponse.json({
    options,
    email,
    device_name: device_name ?? null,
    has_account: !!provisional.profile_id,
  });
}
