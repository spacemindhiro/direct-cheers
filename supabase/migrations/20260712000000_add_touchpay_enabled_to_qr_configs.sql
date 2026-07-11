-- 対面タッチ決済（Case④）をこのQR（商品）に対して許可するかどうかのスイッチ。
-- 対象になりうるのは「entranceタイプ×決済タイプC」または「customタイプ×バウチャー(V)×金額固定」
-- のみで、実際の許可判定はアプリ側（payment-intent API）でも二重に検証する。
ALTER TABLE public.qr_configs
  ADD COLUMN IF NOT EXISTS touchpay_enabled BOOLEAN NOT NULL DEFAULT false;

-- create_qr_bundle を p_touchpay_enabled 対応版に置き換え
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
  p_sales_end_at         TIMESTAMPTZ DEFAULT NULL,
  p_amount_step          INTEGER DEFAULT 100,
  p_recipient_name_context TEXT DEFAULT 'artist',
  p_default_amount       INTEGER DEFAULT NULL,
  p_touchpay_enabled     BOOLEAN DEFAULT FALSE
) RETURNS TABLE(out_qr_config_id UUID, out_product_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id    UUID;
  v_qr_config_id  UUID;
BEGIN
  IF p_recipient_name_context NOT IN ('organizer', 'artist') THEN
    RAISE EXCEPTION 'invalid recipient_name_context: %', p_recipient_name_context;
  END IF;

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
    -- entrance と custom は引数をそのまま使う。それ以外は 'A' 固定。
    CASE WHEN p_product_type IN ('entrance', 'custom') THEN p_payment_type ELSE 'A' END,
    CASE WHEN p_product_type IN ('entrance', 'custom') THEN p_stock_limit  ELSE NULL END,
    CASE WHEN p_product_type IN ('entrance', 'custom') THEN p_track_inventory ELSE FALSE END,
    CASE WHEN p_product_type = 'entrance' AND p_payment_type IN ('A','B') THEN p_sales_start_at ELSE NULL END,
    CASE WHEN p_product_type = 'entrance' AND p_payment_type IN ('A','B') THEN p_sales_end_at   ELSE NULL END
  )
  RETURNING product_id INTO v_product_id;

  INSERT INTO qr_configs (
    event_id,
    creator_profile_id,
    recipient_profile_id,
    recipient_name_context,
    label,
    is_personal,
    image_url,
    product_id,
    serial_scope,
    bypass_validity,
    strip_image_url,
    bg_color,
    fg_color,
    label_color,
    amount_step,
    default_amount,
    touchpay_enabled
  ) VALUES (
    p_event_id,
    p_creator_profile_id,
    p_recipient_profile_id,
    p_recipient_name_context,
    p_label,
    p_is_personal,
    p_image_url,
    v_product_id,
    p_serial_scope,
    p_bypass_validity,
    p_strip_image_url,
    p_bg_color,
    p_fg_color,
    p_label_color,
    p_amount_step,
    COALESCE(p_default_amount, p_min_amount),
    p_touchpay_enabled
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

DROP FUNCTION IF EXISTS create_qr_bundle(UUID,UUID,UUID,TEXT,BOOLEAN,TEXT,TEXT,INTEGER,INTEGER,UUID,TEXT,JSONB,TEXT,INTEGER,BOOLEAN,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,INTEGER,TEXT,INTEGER);

REVOKE EXECUTE ON FUNCTION create_qr_bundle(UUID,UUID,UUID,TEXT,BOOLEAN,TEXT,TEXT,INTEGER,INTEGER,UUID,TEXT,JSONB,TEXT,INTEGER,BOOLEAN,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,INTEGER,TEXT,INTEGER,BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION create_qr_bundle(UUID,UUID,UUID,TEXT,BOOLEAN,TEXT,TEXT,INTEGER,INTEGER,UUID,TEXT,JSONB,TEXT,INTEGER,BOOLEAN,TEXT,BOOLEAN,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,INTEGER,TEXT,INTEGER,BOOLEAN) TO service_role;
