-- ============================================================
-- 消費税集計の修正: グロス再計算を廃止し明細積み上げ方式に統一
--
-- 問題: yayoi-csv が floor(SUM(amount) × 10/110) でグロス再計算していた。
--       明細単位の floor の総和 ≠ グロス計算（端数ズレが確実に発生する）。
-- 修正: 税額は明細テーブル（transaction_distributions.tax_amount）の
--       SUM から取得する。出金手数料も reversal 発生時に確定させ保存する。
-- ============================================================

-- 1. transfer_fee_reversals に税額カラムを追加
--    reversal 1件ごとに floor(amount × 10/110) を計算・保存する
ALTER TABLE public.transfer_fee_reversals
  ADD COLUMN IF NOT EXISTS tax_amount bigint NOT NULL DEFAULT 0;

-- 2. monthly_accounting_reports に税額カラムを追加（監査証跡）
ALTER TABLE public.monthly_accounting_reports
  ADD COLUMN IF NOT EXISTS total_platform_fee_tax bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_reversal_tax     bigint NOT NULL DEFAULT 0;

-- 3. get_monthly_accounting_summary RPC を更新
--    消費税は各明細の tax_amount を SUM する（グロス再計算しない）
CREATE OR REPLACE FUNCTION get_monthly_accounting_summary(
  p_start_utc timestamptz,
  p_end_utc   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  -- A: 当月の決済（status='completed', JST月内のみ）
  tx_month AS (
    SELECT
      COALESCE(SUM(total_gross_amount), 0)::bigint AS total_gross,
      COALESCE(SUM(stripe_fee),         0)::bigint AS total_stripe_fee,
      COALESCE(SUM(platform_fee),       0)::bigint AS total_platform_fee,
      COALESCE(SUM(net_amount),         0)::bigint AS total_net_amount
    FROM transactions
    WHERE status     = 'completed'
      AND deleted_at IS NULL
      AND created_at >= p_start_utc
      AND created_at <  p_end_utc
  ),
  -- A-TAX: システム利用料の消費税（distribution.tax_amount の積み上げ）
  --        platform distribution は complete_cheers_payment で INSERT され、
  --        trg_distribution_tax トリガーが floor(actual_amount × 10/110) を確定済み。
  platform_tax AS (
    SELECT COALESCE(SUM(td.tax_amount), 0)::bigint AS total_platform_fee_tax
    FROM transaction_distributions td
    JOIN transactions tx ON tx.transaction_id = td.transaction_id
    WHERE td.distribution_role = 'platform'
      AND tx.status             = 'completed'
      AND tx.deleted_at         IS NULL
      AND tx.created_at         >= p_start_utc
      AND tx.created_at         <  p_end_utc
  ),
  -- B: 出金手数料回収（transfer_fee_reversals）
  rev_month AS (
    SELECT
      COALESCE(SUM(amount),     0)::bigint AS total_reversal,
      COALESCE(SUM(tax_amount), 0)::bigint AS total_reversal_tax
    FROM transfer_fee_reversals
    WHERE status     = 'succeeded'
      AND created_at >= p_start_utc
      AND created_at <  p_end_utc
  ),
  -- C: 銀行出金（当月分のみ）
  payout_month AS (
    SELECT
      COALESCE(SUM(net_payout_amount), 0)::bigint AS total_payout,
      COALESCE(SUM(requested_amount),  0)::bigint AS total_requested
    FROM payout_requests
    WHERE status     = 'completed'
      AND created_at >= p_start_utc
      AND created_at <  p_end_utc
  ),
  -- D1: プラットフォーム留保分（月末時点で未Transfer）
  d1 AS (
    SELECT COALESCE(SUM(net_amount), 0)::bigint AS balance_platform
    FROM transactions
    WHERE status              = 'completed'
      AND stripe_funds_status = 'held_in_platform'
      AND deleted_at          IS NULL
      AND created_at          < p_end_utc
  ),
  -- D2: Connect口座滞留分
  settle_cum AS (
    SELECT COALESCE(SUM(amount), 0)::bigint AS total_settled
    FROM settle_transfers
    WHERE created_at < p_end_utc
  ),
  payout_cum AS (
    SELECT COALESCE(SUM(requested_amount), 0)::bigint AS total_requested_cum
    FROM payout_requests
    WHERE status     = 'completed'
      AND created_at < p_end_utc
  )
  SELECT jsonb_build_object(
    'total_gross',              tm.total_gross,
    'total_stripe_fee',         tm.total_stripe_fee,
    'total_platform_fee',       tm.total_platform_fee,
    'total_net_amount',         tm.total_net_amount,
    'total_platform_fee_tax',   pt.total_platform_fee_tax,
    'total_reversal_amount',    rm.total_reversal,
    'total_reversal_tax',       rm.total_reversal_tax,
    'total_payout_amount',      pm.total_payout,
    'balance_platform',         d1.balance_platform,
    'balance_connect',          GREATEST(0, sc.total_settled - pc.total_requested_cum),
    'balance_total',            d1.balance_platform + GREATEST(0, sc.total_settled - pc.total_requested_cum)
  )
  INTO v_result
  FROM tx_month tm, platform_tax pt, rev_month rm, payout_month pm,
       d1, settle_cum sc, payout_cum pc;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_monthly_accounting_summary(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION get_monthly_accounting_summary(timestamptz, timestamptz)
  TO service_role;
