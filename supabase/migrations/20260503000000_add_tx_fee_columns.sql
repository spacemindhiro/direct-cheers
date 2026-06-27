-- transactions に手数料カラムを追加し、書き込み時に確定させる
ALTER TABLE public.transactions
  ADD COLUMN stripe_fee  bigint NOT NULL DEFAULT 0,
  ADD COLUMN platform_fee bigint NOT NULL DEFAULT 0,
  ADD COLUMN net_amount   bigint NOT NULL DEFAULT 0;

-- 既存データをバックフィル（platform_config の最新レートで推定値を算出）
UPDATE public.transactions t
SET
  stripe_fee  = FLOOR(t.total_gross_amount *
    CASE WHEN t.payment_method = 'paypay' THEN pc.paypay_rate ELSE pc.stripe_rate END),
  platform_fee = FLOOR(t.total_gross_amount * pc.platform_rate),
  net_amount   = t.total_gross_amount
    - FLOOR(t.total_gross_amount *
        CASE WHEN t.payment_method = 'paypay' THEN pc.paypay_rate ELSE pc.stripe_rate END)
    - FLOOR(t.total_gross_amount * pc.platform_rate)
FROM (
  SELECT stripe_rate, platform_rate, paypay_rate
  FROM public.platform_config
  ORDER BY updated_at DESC
  LIMIT 1
) pc;
