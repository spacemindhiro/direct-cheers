-- PayPay対応
-- 1. eventsにpaypay_enabledを追加
ALTER TABLE public.events
  ADD COLUMN paypay_enabled boolean NOT NULL DEFAULT false;

-- 2. platform_configにpaypay_rateを追加
ALTER TABLE public.platform_config
  ADD COLUMN paypay_rate numeric(6,4) NOT NULL DEFAULT 0.0398;

-- 3. transactionsにpayment_methodを追加（既存は全てcard扱い）
ALTER TABLE public.transactions
  ADD COLUMN payment_method text NOT NULL DEFAULT 'card'
  CHECK (payment_method IN ('card', 'paypay'));
