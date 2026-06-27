import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const RP_ID = req.headers.get("host")?.split(":")[0] ?? "localhost";
  const { email } = await req.json() as { email?: string };

  const admin = createAdminClient();

  // email が指定された場合は該当ユーザーのクレデンシャルのみ提示
  let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] = [];

  if (email) {
    const { data: provisional } = await admin
      .from("provisional_users")
      .select("profile_id")
      .eq("email", email)
      .maybeSingle();

    let profileId = provisional?.profile_id ?? null;

    // provisional に profile_id がない場合は auth users から直接解決
    if (!profileId) {
      try {
        const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const authUser = users.find((u) => u.email === email);
        profileId = authUser?.id ?? null;
      } catch {
        // ignore
      }
    }

    if (profileId) {
      const { data: creds } = await admin
        .from("passkey_credentials")
        .select("credential_id, transports")
        .eq("profile_id", profileId);

      if (creds) {
        allowCredentials = creds.map((c) => ({
          id: c.credential_id,
          transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
        }));
      }
    }

    // email 指定時にパスキーが見つからなければ即エラー
    if (allowCredentials.length === 0) {
      return NextResponse.json({ error: "このメールアドレスにパスキーが登録されていません" }, { status: 400 });
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "required",
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
  });

  // チャレンジを保存
  await admin.from("passkey_challenges").insert({
    challenge: options.challenge,
    profile_id: null,
    purpose: "authentication",
  });

  return NextResponse.json({ options });
}
