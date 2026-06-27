ALTER TABLE transaction_distributions
  ADD COLUMN IF NOT EXISTS amount_before_reconcile bigint;
