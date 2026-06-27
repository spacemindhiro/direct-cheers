-- transactions.status の許容値に "cancelled" を追加
-- オーソリ中（requires_capture）のPIをキャンセルした場合に使用
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'completed'::text,
    'succeeded'::text,
    'failed'::text,
    'refunded'::text,
    'cancelled'::text
  ]));
