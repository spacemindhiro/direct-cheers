-- get_pending_charge_reservations の戻り値型変更対応
-- CREATE OR REPLACE では型変更不可のため DROP して再作成
DROP FUNCTION IF EXISTS public.get_pending_charge_reservations(integer);

CREATE FUNCTION public.get_pending_charge_reservations(p_days_before integer)
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
