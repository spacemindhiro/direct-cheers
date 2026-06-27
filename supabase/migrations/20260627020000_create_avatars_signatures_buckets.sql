-- avatars / signatures バケット作成
-- これまでステージング環境ではSupabase Dashboard経由で手動作成されており、
-- マイグレーション化されていなかった（本番環境にバケット自体が存在しない
-- 原因になっていた）。ステージングの実際の設定値をそのまま再現する。
--
-- どちらもアップロードはservice role経由（RLSバイパス）のみのため、
-- storage.objectsへの専用ポリシーは元々ステージングにも存在しない。

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  null,
  null
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signatures',
  'signatures',
  false,
  2097152,  -- 2MB
  ARRAY['image/png']
)
ON CONFLICT (id) DO NOTHING;
