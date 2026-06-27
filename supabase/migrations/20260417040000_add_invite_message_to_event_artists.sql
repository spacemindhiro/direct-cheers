-- event_artists に招待メッセージカラムを追加（no.38対応）
ALTER TABLE public.event_artists
  ADD COLUMN IF NOT EXISTS invite_message text;
