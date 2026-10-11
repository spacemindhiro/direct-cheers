-- 在庫の仮押さえ（stock_holds）を「在庫の台帳」にし、キャンセル・返金で在庫を戻す。
--
-- 背景: 20261011020000 で決済からの販売を在庫に数えるようにしたが、キャンセル・返金・
-- 予約キャンセルのいずれの経路でも在庫を戻す処理が無かった。
--
-- - 確定（commit）で行を消さず committed_at と payment_ref（決済の PaymentIntent ID、
--   前売りAの予約は 'rsv:<reservation_id>'）を残す。前売りAは予約時に仮押さえ、
--   カード登録（またはオーソリ）の完了で確定する（以前は予約時点で販売済みにしており、
--   カード登録せずに離脱した予約が在庫を食い続けた）
-- - 戻し（release）は payment_ref で引き、確定済み・未返却の行だけを戻す（冪等）
--   台帳に無い販売（この仕組みより前の販売＝もともと数えていなかったもの）は戻さないので、
--   sold_count がずれない
-- - 残数の計算で数える「有効な仮押さえ」は、未確定かつ期限内の行だけ

ALTER TABLE public.stock_holds
  ADD COLUMN IF NOT EXISTS committed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_ref  text,
  ADD COLUMN IF NOT EXISTS released_at  timestamptz;

CREATE INDEX IF NOT EXISTS stock_holds_payment_ref_idx ON public.stock_holds (payment_ref) WHERE payment_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hold_product_stock(
  p_product_id  uuid,
  p_quantity    integer,
  p_hold_key    text,
  p_ttl_seconds integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit   integer;
  v_sold    integer;
  v_track   boolean;
  v_held    integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_product_id::text));

  SELECT stock_limit, sold_count, track_inventory
    INTO v_limit, v_sold, v_track
    FROM products
   WHERE product_id = p_product_id;

  IF NOT FOUND THEN
    RETURN 'sold_out';
  END IF;
  IF v_limit IS NULL OR NOT COALESCE(v_track, false) THEN
    RETURN 'unlimited';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_held
    FROM stock_holds
   WHERE product_id = p_product_id
     AND committed_at IS NULL
     AND expires_at > now();

  IF v_sold + v_held + p_quantity > v_limit THEN
    RETURN 'sold_out';
  END IF;

  INSERT INTO stock_holds (hold_key, product_id, quantity, expires_at)
  VALUES (p_hold_key, p_product_id, p_quantity, now() + make_interval(secs => p_ttl_seconds));
  RETURN 'held';
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_product_stock(p_product_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  integer;
  v_sold   integer;
  v_held   integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_product_id::text));

  SELECT stock_limit, sold_count
    INTO v_limit, v_sold
    FROM products
   WHERE product_id = p_product_id;

  SELECT COALESCE(SUM(quantity), 0) INTO v_held
    FROM stock_holds
   WHERE product_id = p_product_id
     AND committed_at IS NULL
     AND expires_at > now();

  IF v_limit IS NULL OR v_sold + v_held < v_limit THEN
    UPDATE products
       SET sold_count = sold_count + 1,
           updated_at = now()
     WHERE product_id = p_product_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 確定（決済IDつき）。旧版の commit_product_stock(text) は、マイグレーション適用直後に
-- 旧コードが呼んでも確定が抜けないよう残し、下で同じ台帳の動きに作り直す
CREATE OR REPLACE FUNCTION public.commit_product_stock(p_hold_key text, p_payment_ref text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product uuid;
  v_qty     integer;
BEGIN
  IF p_hold_key IS NULL OR p_hold_key = '' THEN
    RETURN;
  END IF;

  UPDATE stock_holds
     SET committed_at = now(),
         payment_ref  = COALESCE(p_payment_ref, payment_ref)
   WHERE hold_key = p_hold_key
     AND committed_at IS NULL
  RETURNING product_id, quantity INTO v_product, v_qty;

  IF v_product IS NOT NULL THEN
    UPDATE products
       SET sold_count = sold_count + v_qty,
           updated_at = now()
     WHERE product_id = v_product;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_product_stock(p_hold_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.commit_product_stock(p_hold_key, NULL::text);
$$;

-- 戻し。確定済み・未返却の行だけを戻す（冪等）。戻した数量を返す
CREATE OR REPLACE FUNCTION public.release_product_stock(p_payment_ref text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r       record;
  v_total integer := 0;
BEGIN
  IF p_payment_ref IS NULL OR p_payment_ref = '' THEN
    RETURN 0;
  END IF;

  FOR r IN
    UPDATE stock_holds
       SET released_at = now()
     WHERE payment_ref = p_payment_ref
       AND committed_at IS NOT NULL
       AND released_at IS NULL
    RETURNING product_id, quantity
  LOOP
    UPDATE products
       SET sold_count = GREATEST(sold_count - r.quantity, 0),
           updated_at = now()
     WHERE product_id = r.product_id;
    v_total := v_total + r.quantity;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hold_product_stock(uuid, integer, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_product_stock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commit_product_stock(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commit_product_stock(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_product_stock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_product_stock(uuid, integer, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_product_stock(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_product_stock(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_product_stock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_product_stock(text) TO service_role;
