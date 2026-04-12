-- transactions.status の許容値に "completed" を追加
-- アプリ全体で "completed" を使用しているため制約側を合わせる
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'succeeded'::text, 'failed'::text, 'refunded'::text]));
