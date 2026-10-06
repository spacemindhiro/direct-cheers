-- カード無効メールの「カードを再登録する」リンク用ワンタイムトークン。
--
-- 背景: カード無効メールのリンク先画面が存在せず404になっていた。一方、旧画面
-- /reservations とその API はメールアドレスだけで他人の予約を閲覧・カード更新
-- 開始（予約を pending に戻す）までできていた。
-- メールに載せたトークンを持つ人（＝そのメールを受け取った本人）だけがカード更新
-- できるようにする。cron がサスペンド時に発行し、カード更新完了で消す。

ALTER TABLE public.entrance_reservations
  ADD COLUMN IF NOT EXISTS card_update_token           uuid,
  ADD COLUMN IF NOT EXISTS card_update_token_issued_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS entrance_reservations_card_update_token_key
  ON public.entrance_reservations (card_update_token)
  WHERE card_update_token IS NOT NULL;
