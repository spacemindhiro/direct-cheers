-- 在庫の「仮押さえ」。
--
-- 背景（2026-10-11 STG検証で発覚）:
-- - 在庫（products.sold_count）を数えていたのは前売り予約API（entrance/reserve）だけで、
--   QR決済（pay/cheers）・タッチ決済（entrance/terminal）からの販売は一度も数えていなかった。
--   在庫上限（前売りBは中止時手数料準備金の算出根拠）を超えて売れてしまう。
-- - 予約APIは決済開始時に sold_count を増やすだけで、払わずに離脱しても戻さなかった。
-- - reserve_product_stock は SECURITY DEFINER のまま anon から実行でき、外部から任意の
--   商品の在庫を使い切らせることができた。
--
-- 方式:
-- - 決済開始時に hold_product_stock で仮押さえ（期限付き）。残りは
--   「stock_limit - sold_count - 有効な仮押さえ」で判定する
-- - 決済完了時に commit_product_stock で仮押さえを sold_count へ移す（冪等）
-- - 期限切れの仮押さえは数えないだけ（Checkout も同じ時間で失効させるため、離脱分は自然に戻る）
-- - 在庫管理対象は track_inventory = true かつ stock_limit あり の商品のみ

CREATE TABLE IF NOT EXISTS public.stock_holds (
  hold_key    text        PRIMARY KEY,
  product_id  uuid        NOT NULL REFERENCES public.products(product_id) ON DELETE CASCADE,
  quantity    integer     NOT NULL CHECK (quantity > 0),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_holds_product_expires_idx ON public.stock_holds (product_id, expires_at);

ALTER TABLE public.stock_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_holds FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_holds TO service_role;

-- 仮押さえ。戻り値: 'unlimited'（在庫管理対象外・何もしない）/ 'held'（仮押さえした）/ 'sold_out'
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
     AND expires_at > now();

  IF v_sold + v_held + p_quantity > v_limit THEN
    RETURN 'sold_out';
  END IF;

  INSERT INTO stock_holds (hold_key, product_id, quantity, expires_at)
  VALUES (p_hold_key, p_product_id, p_quantity, now() + make_interval(secs => p_ttl_seconds));
  RETURN 'held';
END;
$$;

-- 決済完了時。仮押さえを販売済みに移す。仮押さえが無ければ何もしない（冪等）
CREATE OR REPLACE FUNCTION public.commit_product_stock(p_hold_key text)
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

  DELETE FROM stock_holds WHERE hold_key = p_hold_key
  RETURNING product_id, quantity INTO v_product, v_qty;

  IF v_product IS NOT NULL THEN
    UPDATE products
       SET sold_count = sold_count + v_qty,
           updated_at = now()
     WHERE product_id = v_product;
  END IF;
END;
$$;

-- 既存の即時確保（タイプAの予約で使用）も、有効な仮押さえを残数に含める
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

REVOKE EXECUTE ON FUNCTION public.hold_product_stock(uuid, integer, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commit_product_stock(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_product_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_product_stock(uuid, integer, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_product_stock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_product_stock(uuid) TO service_role;
