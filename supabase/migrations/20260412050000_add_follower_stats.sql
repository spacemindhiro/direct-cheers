-- ==========================================
-- フォロワー数キャッシュ + マイルストーン管理
-- ==========================================

-- profiles にフォロワー数キャッシュを追加
ALTER TABLE public.profiles
  ADD COLUMN follower_count integer NOT NULL DEFAULT 0,
  ADD COLUMN follower_milestone integer NOT NULL DEFAULT 0;
  -- follower_milestone: 達成済みの最高マイルストーン（10, 50, 100, 500, 1000...）
  -- 0 = まだ1回もマイルストーン未達成

-- 既存フォローデータからカウントを集計（初期データ反映）
UPDATE public.profiles p
   SET follower_count = (
     SELECT COUNT(*) FROM public.follows f WHERE f.followee_id = p.profile_id
   );

-- ==========================================
-- フォロー時のカウント更新 RPC
-- API 側からトランザクション内で呼ぶことで整合性を保つ
-- ==========================================
CREATE OR REPLACE FUNCTION increment_follower_count(p_profile_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count integer;
  v_milestone integer;
  v_next_milestone integer;
BEGIN
  UPDATE public.profiles
     SET follower_count = follower_count + 1
   WHERE profile_id = p_profile_id
  RETURNING follower_count INTO v_new_count;

  -- マイルストーン判定
  -- 区切り: 10, 50, 100, 500, 1000, 5000, 10000
  SELECT CASE
    WHEN v_new_count >= 10000 THEN 10000
    WHEN v_new_count >= 5000  THEN 5000
    WHEN v_new_count >= 1000  THEN 1000
    WHEN v_new_count >= 500   THEN 500
    WHEN v_new_count >= 100   THEN 100
    WHEN v_new_count >= 50    THEN 50
    WHEN v_new_count >= 10    THEN 10
    ELSE 0
  END INTO v_milestone;

  -- 現在の達成マイルストーンより大きければ更新
  UPDATE public.profiles
     SET follower_milestone = v_milestone
   WHERE profile_id = p_profile_id
     AND follower_milestone < v_milestone;

  RETURN v_new_count;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_follower_count(p_profile_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count integer;
BEGIN
  UPDATE public.profiles
     SET follower_count = GREATEST(follower_count - 1, 0)
   WHERE profile_id = p_profile_id
  RETURNING follower_count INTO v_new_count;

  RETURN v_new_count;
END;
$$;
