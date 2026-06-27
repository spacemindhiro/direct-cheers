import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * マジックリンク送信。クライアントから直接 supabase.auth.signInWithOtp() を
 * 呼ぶのではなく、このルートを経由させる。
 *
 * 理由: signInWithOtp の options.data は「ユーザーが新規作成される場合のみ」
 * user_metadata に反映される仕様で、既存ユーザーには一切反映されない。
 * このプロジェクトは post_auth_redirect を user_metadata に保存し、
 * token_hash フロー（クロスデバイス対応のため emailRedirectTo を使わない）の
 * コールバックでリダイレクト先を復元する設計のため、既存ユーザーが一度でも
 * 何らかのページ（例: 招待受諾 /invite/<token>）へのリダイレクトを指定して
 * ログインすると、その値が永久に user_metadata に焼き付き、以後すべての
 * ログインで同じ（かつ多くの場合使用済みで無効な）ページへ送られ続けてしまう
 * バグがあった。既存ユーザーが見つかった場合は admin API で明示的に
 * user_metadata を上書きしてから signInWithOtp を呼び、常に最新の
 * リダイレクト先が使われるようにする。
 */
export async function POST(req: Request) {
  const { email, redirect } = await req.json() as { email?: string; redirect?: string };
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  const postAuthRedirect = redirect || "/dashboard";

  const admin = createAdminClient();

  // 既存ユーザーを検索（admin API に email フィルタが無いため一覧から探す）
  let existingUserId: string | null = null;
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    const found = data.users.find((u) => u.email === email);
    if (found) { existingUserId = found.id; break; }
    if (data.users.length < 1000) break;
    page++;
  }

  if (existingUserId) {
    const { data: full } = await admin.auth.admin.getUserById(existingUserId);
    await admin.auth.admin.updateUserById(existingUserId, {
      user_metadata: { ...full?.user?.user_metadata, post_auth_redirect: postAuthRedirect },
    });
  }

  const { error } = await admin.auth.signInWithOtp({
    email,
    options: { data: { post_auth_redirect: postAuthRedirect } },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
