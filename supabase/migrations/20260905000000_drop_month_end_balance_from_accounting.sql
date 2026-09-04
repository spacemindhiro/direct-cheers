-- ============================================================
-- get_monthly_accounting_summary: 月末預り金残高(D1/D2)の集計を廃止する
--
-- 【廃止する理由】
-- D1(balance_platform) は transactions.stripe_funds_status = 'held_in_platform'
-- を条件にしていたが、このカラムはINSERT時のDEFAULT以外どこからも更新されていない
-- （全コードベースで書き込みは app/api/invite/[code]/redeem のみ。settle / payout /
--   webhook のいずれも更新しない）。
-- 結果、D1 は実質「全期間の完了取引 net_amount の累計」であり、送金しても出金しても
-- 永久に減らない。STG実データでも当月決済0円の月に balance_platform = 完了取引
-- net_amount 全期間合計と1円単位で一致することを確認済み。
--
-- さらに D2(balance_connect = settle_transfers累計 - payout累計) は、D1 から
-- 消えていない送金済み分と同じ金額を二重計上している。D2 は settle 後返金
-- (transaction_distributions.distribution_status = 'reversed') も控除していない。
--
-- 【廃止してよい理由】
-- balance_* は弥生インポートCSVの仕訳行に一切使われていない（lib/accounting/yayoi-csv.ts
-- が使うのは当月フローの platform_fee / net_amount / reversal / payout のみ）。
-- 管理画面の表示専用の数値だった。同種のB/S項目は get_role_income_summary の
-- outstanding_balance が now() 基準・reversed 控除済みで正しく提供している
-- （20260811230000_fix_outstanding_balance_now_basis.sql 参照）。
--
-- 【テーブルのカラムについて】
-- monthly_accounting_reports.month_end_balance / _platform / _connect は
-- DROP せず残す（本番の既存行を不可逆に壊さないため）。以後 cron は書き込まないので
-- 新規行は DEFAULT 0 になる。過去行に残っている値は信頼できないため参照しないこと。
-- ============================================================

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
  )
  SELECT jsonb_build_object(
    'total_gross',              tm.total_gross,
    'total_stripe_fee',         tm.total_stripe_fee,
    'total_platform_fee',       tm.total_platform_fee,
    'total_net_amount',         tm.total_net_amount,
    'total_platform_fee_tax',   pt.total_platform_fee_tax,
    'total_reversal_amount',    rm.total_reversal,
    'total_reversal_tax',       rm.total_reversal_tax,
    'total_payout_amount',      pm.total_payout
  )
  INTO v_result
  FROM tx_month tm, platform_tax pt, rev_month rm, payout_month pm;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_monthly_accounting_summary(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION get_monthly_accounting_summary(timestamptz, timestamptz)
  TO service_role;

COMMENT ON COLUMN public.monthly_accounting_reports.month_end_balance IS
  '廃止済み(2026-09-05)。stripe_funds_status未更新によりD1が減らず二重計上していたため集計を停止。新規行は常に0。過去行の値は信頼できない。';
COMMENT ON COLUMN public.monthly_accounting_reports.month_end_balance_platform IS
  '廃止済み(2026-09-05)。同上。';
COMMENT ON COLUMN public.monthly_accounting_reports.month_end_balance_connect IS
  '廃止済み(2026-09-05)。同上。';
