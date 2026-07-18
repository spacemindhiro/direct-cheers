import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(user.id);
  const email = authUser.user?.email;
  if (!email) return NextResponse.json({ error: "Email not found" }, { status: 400 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com";

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${siteUrl}/auth/callback?redirect=${encodeURIComponent("/auth/passkey-setup")}`,
    },
  });

  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json({ error: "リンクの生成に失敗しました" }, { status: 500 });
  }

  const token = randomBytes(5).toString("base64url"); // 7文字の URL-safe トークン
  // action_linkにはgenerateLinkが返すSupabase自体のドメイン(/auth/v1/verify)を
  // 使わず、hashed_tokenから自サイトのtoken_hashフローURLを組み立てる。
  // action_linkをそのまま使うと、Supabase側のverifyエンドポイントが検証後に
  // access_token等をURLフラグメント(#access_token=...)で返す実装のため、
  // フラグメントを読めないサーバー側の/auth/callbackでは処理できずログインが
  // 常に失敗していた（token_hashフローは既存のメールログインと同じ形式で、
  // /auth/callbackが元々対応しているクエリパラメータのみで完結する）。
  const actionLink = `${siteUrl}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink&redirect=${encodeURIComponent("/auth/passkey-setup")}`;
  const { error: insertError } = await admin
    .from("scanner_qr_tokens")
    .insert({
      token,
      action_link: actionLink,
      created_by: user.id,
    });

  if (insertError) {
    return NextResponse.json({ error: "トークン保存に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ url: `${siteUrl}/auth/qr/${token}` });
}
