-- ============================================================
-- auth.users をメールアドレスで1件引くRPCを追加する
--
-- 【背景】
-- Supabase の admin API (auth.admin.listUsers) にはメールフィルタが無いため、
-- コード側では「全ユーザーを1ページ取得して JS の find で探す」実装になっていた。
--
--   const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
--   return users.find((u) => u.email === email)?.id ?? null;
--
-- これが以下6箇所にあり、うち5箇所は1ページ目しか見ていない。
--   lib/resolve-profile.ts                        (決済のたびに実行される)
--   app/api/passkeys/auth-options/route.ts
--   app/api/passkeys/register-options/route.ts
--   app/api/passkeys/register-verify/route.ts     (2箇所)
--   app/api/auth/send-magic-link/route.ts         (ここだけページングループ済み)
--
-- 【何が起きるか】
-- 登録ユーザーが1000人を超えると、1001人目以降は既に登録済みでも見つからない。
-- lib/resolve-profile.ts が null を返すと tickets.holder_profile_id が NULL の
-- ままチケットが発行される。holder_profile_id をメアド一致で後から埋める処理は
-- どこにも無いため、この取りこぼしは恒久的に残る。
-- パスキー系3箇所では、既存ユーザーを見つけられずに別アカウントを作ってしまう。
--
-- 【対処】
-- auth.users を直接1件引く SECURITY DEFINER 関数を用意し、全箇所をこれに寄せる。
-- auth.users.email には GoTrue が一意インデックスを張っているため O(1) で引ける。
-- ページングループ方式（送信メール1通あたり最大 N/1000 回のAPI呼び出し）も不要になる。
--
-- 【email の大文字小文字】
-- GoTrue は登録時にメールを小文字化して保存する。従来の JS 側は u.email === email の
-- 完全一致だったため、呼び出し側が大文字混じりのメールを渡すと取りこぼしていた。
-- ここでは lower(p_email) で正規化して引く（従来より取りこぼしが減る方向の変更）。
-- email 列そのものに lower() を掛けると一意インデックスが使えなくなるため掛けない。
--
-- 【is_sso_user = false と deleted_at IS NULL を条件に入れている理由】
-- auth.users の email 一意インデックスは部分インデックスである:
--   CREATE UNIQUE INDEX users_email_partial_key
--     ON auth.users USING btree (email) WHERE (is_sso_user = false)
-- 部分インデックスはクエリ側に同じ述語が無いとプランナが使えないため、
-- is_sso_user = false を明示する。本サービスはSSOを使っておらず、そもそも
-- このインデックスが一意性を保証しているのも非SSOユーザーのみ。
-- deleted_at は論理削除済みユーザーを拾わないための条件（列は実在する）。
-- ============================================================

CREATE OR REPLACE FUNCTION public.find_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id
    FROM auth.users
   WHERE email       = lower(p_email)
     AND is_sso_user = false
     AND deleted_at  IS NULL
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.find_auth_user_id_by_email(text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.find_auth_user_id_by_email(text)
  TO service_role;

COMMENT ON FUNCTION public.find_auth_user_id_by_email(text) IS
  'auth.users をメールで1件引く。admin API の listUsers に email フィルタが無く、1ページ1000件の取りこぼしが起きていたため追加した。service_role 専用。';
