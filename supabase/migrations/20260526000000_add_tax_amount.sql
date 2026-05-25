-- ============================================================
-- 消費税額カラム追加
-- 内税10%: tax = FLOOR(actual_amount * 10 / 110)
-- 明細単位で計算してtransactionsへ積み上げる。グロスからは計算しない。
-- ============================================================

-- 1. カラム追加
ALTER TABLE public.transaction_distributions
  ADD COLUMN IF NOT EXISTS tax_amount bigint NOT NULL DEFAULT 0;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS tax_amount bigint NOT NULL DEFAULT 0;

-- 2. 配分明細の消費税自動計算トリガー
--    INSERT / actual_amount UPDATE 時に tax_amount を再計算する
CREATE OR REPLACE FUNCTION public.calc_distribution_tax()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.tax_amount := FLOOR(NEW.actual_amount::numeric * 10 / 110);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_distribution_tax
BEFORE INSERT OR UPDATE OF actual_amount
ON public.transaction_distributions
FOR EACH ROW EXECUTE FUNCTION public.calc_distribution_tax();

-- 3. transactions.tax_amount を配分明細から積み上げるトリガー
--    distribution の INSERT / tax_amount UPDATE / DELETE 後に合計を再計算する
CREATE OR REPLACE FUNCTION public.accumulate_transaction_tax()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
BEGIN
  v_tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  UPDATE public.transactions
  SET tax_amount = (
    SELECT COALESCE(SUM(tax_amount), 0)
    FROM public.transaction_distributions
    WHERE transaction_id = v_tx_id
  )
  WHERE transaction_id = v_tx_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_accumulate_tax
AFTER INSERT OR UPDATE OF tax_amount OR DELETE
ON public.transaction_distributions
FOR EACH ROW EXECUTE FUNCTION public.accumulate_transaction_tax();

-- 4. 既存データのバックフィル（明細単位で計算→積み上げ）
UPDATE public.transaction_distributions
  SET tax_amount = FLOOR(actual_amount::numeric * 10 / 110);

UPDATE public.transactions t
  SET tax_amount = (
    SELECT COALESCE(SUM(d.tax_amount), 0)
    FROM public.transaction_distributions d
    WHERE d.transaction_id = t.transaction_id
  );
