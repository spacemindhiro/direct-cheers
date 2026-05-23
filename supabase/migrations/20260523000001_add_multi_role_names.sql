-- コンテキスト別の表示名
-- artist_name  : DJ/アーティストとして出演するときの名前（ラインナップ・Wallet・通知）
-- organizer_name: イベントを主催するときの名前（主催者通知・イベントページ）
-- どちらも null の場合は display_name にフォールバック

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS artist_name    text,
  ADD COLUMN IF NOT EXISTS organizer_name text;
