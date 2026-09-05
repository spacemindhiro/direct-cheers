import { createAdminClient } from "@/lib/supabase/admin";

/**
 * auth.users をメールアドレスで1件引く。
 *
 * admin API の listUsers には email フィルタが無いため、以前は
 * listUsers({ page: 1, perPage: 1000 }) の結果を JS の find で探していた。
 * この方式は登録ユーザーが1000人を超えると1001人目以降を取りこぼし、
 * 既に登録済みのユーザーを「いない」と誤判定する。
 * find_auth_user_id_by_email RPC（auth.users.email の一意インデックスを使う）に
 * 寄せて上限そのものを無くす。
 *
 * 見つからない場合と引けなかった場合を区別できないと障害の切り分けができないため、
 * エラーは握り潰さずログに出す（戻り値は従来通り null）。
 */
export async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string | null,
): Promise<string | null> {
  if (!email) return null;
  const { data, error } = await admin.rpc("find_auth_user_id_by_email", { p_email: email });
  if (error) {
    console.error(`[findAuthUserIdByEmail] RPC失敗: ${error.message}`);
    return null;
  }
  return (data as string | null) ?? null;
}

export async function resolveProfileIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string | null,
): Promise<string | null> {
  if (!email) return null;
  const { data: prov } = await admin
    .from("provisional_users")
    .select("profile_id")
    .eq("email", email)
    .maybeSingle();
  if (prov?.profile_id) return prov.profile_id;
  return findAuthUserIdByEmail(admin, email);
}
