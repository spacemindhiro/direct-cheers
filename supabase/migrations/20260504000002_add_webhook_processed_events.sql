-- Stripe Webhook の全イベントに対するイベント ID レベルの冪等性保護
-- どのイベントタイプでも二重配信されうるため、stripe_event_id を一意キーとして管理する

CREATE TABLE IF NOT EXISTS public.webhook_processed_events (
  id              BIGSERIAL    PRIMARY KEY,
  processed_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  stripe_event_id TEXT         NOT NULL UNIQUE,
  event_type      TEXT         NOT NULL
);

COMMENT ON TABLE  public.webhook_processed_events IS 'Stripe Webhook の処理済みイベントID。二重配信対策。';
COMMENT ON COLUMN public.webhook_processed_events.stripe_event_id IS 'Stripe の event.id（全種別共通で一意）';

-- 処理済み確認クエリを高速化
CREATE INDEX IF NOT EXISTS webhook_processed_events_event_id_idx
  ON public.webhook_processed_events (stripe_event_id);

ALTER TABLE public.webhook_processed_events DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.webhook_processed_events TO service_role;
