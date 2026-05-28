-- Stripe決済手数料の外税化対応（2026年4月〜）
-- カード: 3.6% × 1.1（消費税） = 3.96% = 0.03960
-- PayPay: 3.98% × 1.1（消費税） = 4.378% = 0.04378

-- paypay_rate は小数5桁必要（0.04378）なので精度を拡張
ALTER TABLE public.platform_config
  ALTER COLUMN stripe_rate TYPE numeric(7,5),
  ALTER COLUMN paypay_rate TYPE numeric(7,5);

-- 最新行のレートを更新
UPDATE public.platform_config
SET stripe_rate = 0.03960,
    paypay_rate = 0.04378,
    updated_at  = now()
WHERE config_id = (
  SELECT config_id FROM public.platform_config ORDER BY updated_at DESC LIMIT 1
);
