import { createClient } from "@/lib/supabase/server";

/**
 * 現在のSupabaseセッションが profileId 本人のものかを返す。
 *
 * /api/passkeys/register-options と register-verify はオンボーディング用に
 * 未ログイン状態でクライアント指定のemailを受け付けるが、そのemailが
 * 既存の auth ユーザーに解決された場合は「本人がログイン中」であることを
 * 必須にする。これが無いと、メールアドレスを知っているだけで他人の
 * アカウントにパスキーを追加してログインできてしまう。
 */
export async function isSessionOwnerOf(profileId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id === profileId;
}
