-- ============================================================
-- 月次会計バッチ: 弥生会計インポート用集計テーブル + 集計RPC
-- ============================================================

-- ── 月次会計レポート保存テーブル ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monthly_accounting_reports (
  report_id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_year            integer     NOT NULL,
  target_month           integer     NOT NULL CHECK (target_month BETWEEN 1 AND 12),
  -- A: 当月決済集計
  total_gross            bigint      NOT NULL DEFAULT 0,
  total_stripe_fee       bigint      NOT NULL DEFAULT 0,
  total_platform_fee     bigint      NOT NULL DEFAULT 0,
  total_net_amount       bigint      NOT NULL DEFAULT 0,
  -- B: 出金手数料回収（Reverse Transfer）
  total_reversal_amount  bigint      NOT NULL DEFAULT 0,
  -- C: 実際の銀行出金（Payout.net_payout_amount）
  total_payout_amount    bigint      NOT NULL DEFAULT 0,
  -- D: 月末時点の預り金残高
  month_end_balance      bigint      NOT NULL DEFAULT 0,  -- D1 + D2
  month_end_balance_platform bigint  NOT NULL DEFAULT 0,  -- D1: 未Transfer分
  month_end_balance_connect  bigint  NOT NULL DEFAULT 0,  -- D2: Transfer済み未Payout分
  -- 生成CSV（監査証跡として保存）
  csv_content            text,
  -- メタ
  status                 text        NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'error')),
  error_message          text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_accounting_reports_ym_key UNIQUE (target_year, target_month)
);

CREATE INDEX IF NOT EXISTS monthly_accounting_reports_ym_idx
  ON public.monthly_accounting_reports (target_year DESC, target_month DESC);

-- RLS: service_role のみ書き込み・admin ロールは読み取り可
REVOKE ALL ON public.monthly_accounting_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.monthly_accounting_reports TO service_role;

-- ── 月次会計集計RPC ───────────────────────────────────────────────────
-- 引数: JST月初(UTC), JST翌月初(UTC)  →  一発集計して jsonb を返す
-- 全集計をDBサーバー側で完結させることで JS 行数上限(1000件)を回避する
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
  -- B: 出金手数料回収（transfer_fee_reversals.created_at で月単位フィルタ）
  rev_month AS (
    SELECT COALESCE(SUM(amount), 0)::bigint AS total_reversal
    FROM transfer_fee_reversals
    WHERE status     = 'succeeded'
      AND created_at >= p_start_utc
      AND created_at <  p_end_utc
  ),
  -- C: 銀行出金（当月分のみ・net_payout_amount）
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
  --     月末 = p_end_utc より前かつ stripe_funds_status='held_in_platform'
  d1 AS (
    SELECT COALESCE(SUM(net_amount), 0)::bigint AS balance_platform
    FROM transactions
    WHERE status              = 'completed'
      AND stripe_funds_status = 'held_in_platform'
      AND deleted_at          IS NULL
      AND created_at          < p_end_utc
  ),
  -- D2: Connect口座滞留分（Transfer済みで月末時点でまだ出金されていない）
  --     = SUM(settle_transfers) - SUM(payout_requests.requested_amount)
  --     ※ requested_amount = net_payout + stripe_fee_deducted（= Connect口座から出て行った全額）
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
    'total_gross',            tm.total_gross,
    'total_stripe_fee',       tm.total_stripe_fee,
    'total_platform_fee',     tm.total_platform_fee,
    'total_net_amount',       tm.total_net_amount,
    'total_reversal_amount',  rm.total_reversal,
    'total_payout_amount',    pm.total_payout,
    'balance_platform',       d1.balance_platform,
    'balance_connect',        GREATEST(0, sc.total_settled - pc.total_requested_cum),
    'balance_total',          d1.balance_platform + GREATEST(0, sc.total_settled - pc.total_requested_cum)
  )
  INTO v_result
  FROM tx_month tm, rev_month rm, payout_month pm, d1, settle_cum sc, payout_cum pc;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_monthly_accounting_summary(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION get_monthly_accounting_summary(timestamptz, timestamptz)
  TO service_role;
