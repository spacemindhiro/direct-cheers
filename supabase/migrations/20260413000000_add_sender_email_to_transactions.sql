-- transactions に sender_email を追加
-- 決済時のメールアドレスを保存し、本登録後でも同じメアドで取引を引けるようにする
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS sender_email text;

CREATE INDEX IF NOT EXISTS transactions_sender_email_idx ON public.transactions(sender_email);
