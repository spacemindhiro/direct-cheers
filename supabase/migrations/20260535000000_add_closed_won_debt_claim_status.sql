-- debt_claims.status に 'closed_won' を追加
-- チャージバック勝訴（Stripe が加盟店側を支持した）ケースで使用

ALTER TABLE public.debt_claims
  DROP CONSTRAINT debt_claims_status_check;

ALTER TABLE public.debt_claims
  ADD CONSTRAINT debt_claims_status_check
  CHECK (status = ANY (ARRAY[
    'active'::text,
    'recovered'::text,
    'written_off'::text,
    'closed_won'::text
  ]));
