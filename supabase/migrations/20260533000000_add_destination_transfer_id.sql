ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS destination_transfer_id TEXT;
