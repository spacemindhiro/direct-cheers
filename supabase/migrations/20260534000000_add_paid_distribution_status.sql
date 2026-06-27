-- distribution_status に 'paid' を追加
-- payout_requests 処理後の分配行ステータスとして使用されるが、元の CHECK 制約に含まれていなかった

ALTER TABLE public.transaction_distributions
  DROP CONSTRAINT transaction_distributions_distribution_status_check;

ALTER TABLE public.transaction_distributions
  ADD CONSTRAINT transaction_distributions_distribution_status_check
  CHECK (distribution_status = ANY (ARRAY[
    'accrued'::text,
    'scheduled'::text,
    'transferred'::text,
    'voided'::text,
    'reversed'::text,
    'paid'::text
  ]));
