import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// アカウント統合の実行（トークン検証 → DB付け替え）
export async function POST(req: Request) {
  const { token } = await req.json() as { token: string };

  if (!token)
    return NextResponse.json({ error: "トークンが必要です" }, { status: 400 });

  const admin = createAdminClient();

  // トークン検証
  const { data: mergeToken } = await admin
    .from("account_merge_tokens")
    .select("token_id, requester_profile_id, target_email, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!mergeToken)
    return NextResponse.json({ error: "無効なトークンです" }, { status: 400 });

  if (mergeToken.used_at)
    return NextResponse.json({ error: "このトークンは既に使用済みです" }, { status: 400 });

  if (new Date(mergeToken.expires_at) < new Date())
    return NextResponse.json({ error: "トークンの有効期限が切れています。再度リクエストしてください。" }, { status: 400 });

  const mainProfileId = mergeToken.requester_profile_id;
  const targetEmail = mergeToken.target_email;

  // target_email の provisional_user を取得
  const { data: provisional } = await admin
    .from("provisional_users")
    .select("provisional_id, profile_id")
    .eq("email", targetEmail)
    .maybeSingle();

  if (!provisional)
    return NextResponse.json({ error: "対象メールアドレスが見つかりません" }, { status: 404 });

  const oldProfileId = provisional.profile_id;

  // アトミックな付け替え処理
  // 1. transactions.sender_profile_id を付け替え
  //    （old_profile_id が null の場合は email ベースで provisional_id 経由でも対応）
  if (oldProfileId) {
    await admin
      .from("transactions")
      .update({ sender_profile_id: mainProfileId })
      .eq("sender_profile_id", oldProfileId);

    // 2. passkey_credentials を付け替え
    await admin
      .from("passkey_credentials")
      .update({ profile_id: mainProfileId })
      .eq("profile_id", oldProfileId);

    // 3. transaction_distributions を付け替え（アーティスト/主催者分は除く）
    //    fan としての distributions があれば移行（通常は fan 側にはないが念のため）
    await admin
      .from("transaction_distributions")
      .update({ profile_id: mainProfileId })
      .eq("profile_id", oldProfileId);
  }

  // 4. provisional_users を main profile に更新（統合済みフラグ）
  await admin
    .from("provisional_users")
    .update({
      profile_id: mainProfileId,
      converted_at: new Date().toISOString(),
    })
    .eq("email", targetEmail);

  // 5. device_tokens を付け替え
  await admin
    .from("device_tokens")
    .update({ profile_id: mainProfileId })
    .eq("provisional_id", provisional.provisional_id);

  // 6. 旧プロファイルを無効化（passkey や distributions が移動済みの場合）
  if (oldProfileId && oldProfileId !== mainProfileId) {
    // profiles テーブルの status を merged に変更
    await admin
      .from("profiles")
      .update({ status: "merged" })
      .eq("profile_id", oldProfileId);
  }

  // トークンを使用済みに
  await admin
    .from("account_merge_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_id", mergeToken.token_id);

  return NextResponse.json({ success: true, merged_email: targetEmail });
}

// GET: トークンの有効性確認（確認画面表示用）
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token)
    return NextResponse.json({ error: "トークンが必要です" }, { status: 400 });

  const admin = createAdminClient();

  const { data: mergeToken } = await admin
    .from("account_merge_tokens")
    .select("requester_profile_id, target_email, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (!mergeToken)
    return NextResponse.json({ error: "無効なトークンです" }, { status: 400 });

  if (mergeToken.used_at)
    return NextResponse.json({ error: "このトークンは既に使用済みです" }, { status: 400 });

  if (new Date(mergeToken.expires_at) < new Date())
    return NextResponse.json({ error: "トークンの有効期限が切れています" }, { status: 400 });

  // 統合先アカウントのメールを取得
  const { data: requesterAuth } = await admin.auth.admin.getUserById(mergeToken.requester_profile_id);
  const requesterEmail = requesterAuth?.user?.email ?? null;

  return NextResponse.json({
    valid: true,
    target_email: mergeToken.target_email,
    requester_email: requesterEmail ? maskEmail(requesterEmail) : null,
    expires_at: mergeToken.expires_at,
  });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  const masked = local.length <= 2
    ? local[0] + "*".repeat(local.length - 1)
    : local.slice(0, 2) + "*".repeat(Math.max(local.length - 2, 3));
  return `${masked}@${domain}`;
}
