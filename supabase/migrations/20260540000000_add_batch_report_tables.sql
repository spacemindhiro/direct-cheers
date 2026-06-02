-- ============================================================
-- 日次業務レポート共通テーブル
-- オーナーがAdmin管理画面で全Cronの処理結果を確認・リスク管理するための基盤
-- ============================================================

-- 日次業務サマリー
CREATE TABLE IF NOT EXISTS public.daily_business_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  process_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  task_name       TEXT        NOT NULL,
  total_events    INTEGER     DEFAULT 0,
  target_count    INTEGER     NOT NULL DEFAULT 0,
  target_amount   BIGINT      NOT NULL DEFAULT 0,
  success_count   INTEGER     NOT NULL DEFAULT 0,
  success_amount  BIGINT      NOT NULL DEFAULT 0,
  failed_count    INTEGER     NOT NULL DEFAULT 0,
  failed_amount   BIGINT      NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT '正常完了'
    CHECK (status IN ('正常完了', '要確認・未回収あり')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS daily_business_reports_process_date_idx
  ON public.daily_business_reports (process_date DESC);
CREATE INDEX IF NOT EXISTS daily_business_reports_task_name_idx
  ON public.daily_business_reports (task_name);
CREATE INDEX IF NOT EXISTS daily_business_reports_status_idx
  ON public.daily_business_reports (status);

-- 未回収・異常リスク明細
CREATE TABLE IF NOT EXISTS public.uncollected_revenue_details (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID        NOT NULL
    REFERENCES public.daily_business_reports(id) ON DELETE CASCADE,
  task_name       TEXT        NOT NULL,
  event_name      TEXT,
  organizer_name  TEXT,
  customer_name   TEXT,
  target_name     TEXT,
  amount          BIGINT      NOT NULL DEFAULT 0,
  failure_reason  TEXT        NOT NULL,
  action_status   TEXT        NOT NULL DEFAULT '未対応'
    CHECK (action_status IN ('未対応', '対応済')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS uncollected_revenue_details_report_id_idx
  ON public.uncollected_revenue_details (report_id);
CREATE INDEX IF NOT EXISTS uncollected_revenue_details_action_status_idx
  ON public.uncollected_revenue_details (action_status);

-- RLS: service_role のみ書き込み可、admin ロールは読み取り可
REVOKE ALL ON public.daily_business_reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.uncollected_revenue_details FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.daily_business_reports TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.uncollected_revenue_details TO service_role;
