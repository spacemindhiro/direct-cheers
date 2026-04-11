import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";

const RP_ID = process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID ?? "localhost";

export async function POST(req: Request) {
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

    if (provisional?.profile_id) {
      const { data: creds } = await admin
        .from("passkey_credentials")
        .select("credential_id, transports")
        .eq("profile_id", provisional.profile_id);

      if (creds) {
        allowCredentials = creds.map((c) => ({
          id: c.credential_id,
          transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
        }));
      }
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
