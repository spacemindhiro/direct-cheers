-- create_qr_bundle の qr_configs insert で entrance 以外のとき
-- bg_color/fg_color/label_color に NULL を明示挿入していたため NOT NULL 制約違反。
-- 色はすべての商品タイプで共通のデザインプロパティなので常にパラメータ値を使う。
CREATE OR REPLACE FUNCTION create_qr_bundle(
  p_event_id             UUID,
  p_creator_profile_id   UUID,
  p_recipient_profile_id UUID,
  p_label                TEXT,
  p_is_personal          BOOLEAN,
  p_image_url            TEXT,
  p_product_type         TEXT,
  p_min_amount           INTEGER,
  p_max_amount           INTEGER,
  p_artist_id            UUID,
  p_product_name         TEXT,
  p_targets              JSONB,
  p_payment_type         TEXT    DEFAULT 'A',
  p_stock_limit          INTEGER DEFAULT NULL,
  p_track_inventory      BOOLEAN DEFAULT TRUE,
  p_serial_scope         TEXT    DEFAULT 'event',
  p_bypass_validity      BOOLEAN DEFAULT FALSE,
  p_strip_image_url      TEXT    DEFAULT NULL,
  p_bg_color             TEXT    DEFAULT '#0f172a',
  p_fg_color             TEXT    DEFAULT '#ffffff',
  p_label_color          TEXT    DEFAULT '#94a3b8',
  p_sales_start_at       TIMESTAMPTZ DEFAULT NULL,
  p_sales_end_at         TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE(out_qr_config_id UUID, out_product_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id    UUID;
  v_qr_config_id  UUID;
BEGIN
  -- products insert
  -- payment_type: entrance のみ意味を持つが NOT NULL のため entrance 以外は 'A' を入れる
  INSERT INTO products (
    event_id,
    artist_id,
    name,
    type,
    min_amount,
    max_amount,
    payment_type,
    stock_limit,
    track_inventory,
    sales_start_at,
    sales_end_at
  ) VALUES (
    p_event_id,
    p_artist_id,
    p_product_name,
    p_product_type,
    p_min_amount,
    p_max_amount,
    CASE WHEN p_product_type = 'entrance' THEN p_payment_type ELSE 'A' END,
    CASE WHEN p_product_type = 'entrance' THEN p_stock_limit  ELSE NULL END,
    CASE WHEN p_product_type = 'entrance' THEN p_track_inventory ELSE FALSE END,
    CASE WHEN p_product_type = 'entrance' AND p_payment_type IN ('A','B') THEN p_sales_start_at ELSE NULL END,
    CASE WHEN p_product_type = 'entrance' AND p_payment_type IN ('A','B') THEN p_sales_end_at   ELSE NULL END
  )
  RETURNING product_id INTO v_product_id;

  -- qr_configs insert
  -- bg_color/fg_color/label_color は NOT NULL のため常にパラメータ値を使う（デフォルト値あり）
  INSERT INTO qr_configs (
    event_id,
    creator_profile_id,
    recipient_profile_id,
    label,
    is_personal,
    image_url,
    product_id,
    serial_scope,
    bypass_validity,
    strip_image_url,
    bg_color,
    fg_color,
    label_color
  ) VALUES (
    p_event_id,
    p_creator_profile_id,
    p_recipient_profile_id,
    p_label,
    p_is_personal,
    p_image_url,
    v_product_id,
    p_serial_scope,
    p_bypass_validity,
    p_strip_image_url,
    p_bg_color,
    p_fg_color,
    p_label_color
  )
  RETURNING qr_config_id INTO v_qr_config_id;

  INSERT INTO qr_config_targets (qr_config_id, profile_id, distribution_ratio)
  SELECT
    v_qr_config_id,
    (t->>'profile_id')::UUID,
    (t->>'distribution_ratio')::NUMERIC
  FROM jsonb_array_elements(p_targets) AS t;

  RETURN QUERY SELECT v_qr_config_id, v_product_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_qr_bundle FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION create_qr_bundle TO service_role;
