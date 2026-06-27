ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS receipt_sent_at timestamptz;
