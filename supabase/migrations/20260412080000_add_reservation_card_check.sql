-- ==========================================
-- entrance_reservations: カードエラー詳細・チェック記録
-- ==========================================
ALTER TABLE public.entrance_reservations
  ADD COLUMN IF NOT EXISTS card_error_message   text,
  ADD COLUMN IF NOT EXISTS card_error_code      text,   -- Stripe decline_code
  ADD COLUMN IF NOT EXISTS retry_count          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at        timestamptz;

-- ==========================================
-- get_pending_charge_reservations を更新:
-- 10日前チェック用に card_checked_at IS NULL 条件を追加した別RPCを定義
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_pending_card_check_reservations()
RETURNS TABLE (
  reservation_id            uuid,
  stripe_customer_id        text,
  stripe_payment_method_id  text,
  charge_amount             bigint,
  email                     text,
  event_id                  uuid,
  product_id                uuid,
  event_title               text,
  product_name              text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    r.reservation_id,
    r.stripe_customer_id,
    r.stripe_payment_method_id,
    r.charge_amount,
    r.email,
    r.event_id,
    r.product_id,
    e.title   AS event_title,
    p.name    AS product_name
  FROM public.entrance_reservations r
  JOIN public.events   e ON e.event_id   = r.event_id
  JOIN public.products p ON p.product_id = r.product_id
  WHERE r.status = 'reserved'
    AND r.card_checked_at IS NULL          -- まだチェックしていない
    AND r.stripe_payment_method_id IS NOT NULL
    AND p.payment_type = 'A'
    -- イベント開始が今から9〜11日後（10日前 ±1日のウィンドウ）
    AND e.start_at BETWEEN now() + interval '9 days'
                       AND now() + interval '11 days';
$$;

-- get_pending_charge_reservations を更新: event_title / product_name を追加（戻り値型変更のため DROP して再作成）
DROP FUNCTION IF EXISTS public.get_pending_charge_reservations(integer);
CREATE OR REPLACE FUNCTION public.get_pending_charge_reservations(p_days_before integer)
RETURNS TABLE (
  reservation_id            uuid,
  stripe_customer_id        text,
  stripe_payment_method_id  text,
  charge_amount             bigint,
  email                     text,
  event_id                  uuid,
  product_id                uuid,
  event_title               text,
  product_name              text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    r.reservation_id,
    r.stripe_customer_id,
    r.stripe_payment_method_id,
    r.charge_amount,
    r.email,
    r.event_id,
    r.product_id,
    e.title   AS event_title,
    p.name    AS product_name
  FROM public.entrance_reservations r
  JOIN public.events   e ON e.event_id   = r.event_id
  JOIN public.products p ON p.product_id = r.product_id
  WHERE r.status = 'reserved'
    AND r.stripe_payment_method_id IS NOT NULL
    AND p.payment_type = 'A'
    AND e.start_at BETWEEN now() + ((p_days_before - 1) || ' days')::interval
                       AND now() + (p_days_before        || ' days')::interval;
$$;
