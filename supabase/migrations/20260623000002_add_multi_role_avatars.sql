-- コンテキスト別のアバター画像（20260523000001_add_multi_role_names.sql の画像版）
-- artist_avatar_url   : DJ/アーティストとして出演するときに使う画像（Wallet/チアカードのロゴ等）
-- organizer_avatar_url: イベントを主催するときに使う画像
-- どちらも null の場合は avatar_url にフォールバック

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS artist_avatar_url    text,
  ADD COLUMN IF NOT EXISTS organizer_avatar_url text;
