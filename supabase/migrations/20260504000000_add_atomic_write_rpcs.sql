-- 複数テーブルへの書き込みをアトミックにするストアドプロシージャ群
-- 各関数はplpgsqlトランザクション内で実行されるため、いずれかのINSERT/UPDATEが失敗した場合は全件ロールバックされる

-- ============================================================
-- 1. complete_cheers_payment
--    用途: /api/pay/complete, /api/stripe/webhook (checkout.session.completed)
--    アトミック: provisional_users upsert + transactions insert + agent fee distribution insert
-- ============================================================
CREATE OR REPLACE FUNCTION complete_cheers_payment(
  p_stripe_payment_intent_id TEXT,
  p_product_id               UUID,
  p_qr_config_id             UUID,
  p_email                    TEXT,
  p_stripe_customer_id       TEXT,
  p_gross                    BIGINT,
  p_stripe_fee               BIGINT,
  p_platform_fee             BIGINT,
  p_net_amount               BIGINT,
  p_payment_method           TEXT    DEFAULT 'card',
  p_sender_name              TEXT    DEFAULT NULL,
  p_sender_comment           TEXT    DEFAULT NULL,
  p_event_id                 UUID    DEFAULT NULL,
  p_agent_id                 UUID    DEFAULT NULL,
  p_agent_fee                BIGINT  DEFAULT 0
) RETURNS TABLE(out_transaction_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
  v_profile_id     UUID;
BEGIN
  -- provisional_users upsert (email が NULL の場合はスキップ)
  IF p_email IS NOT NULL THEN
    INSERT INTO provisional_users (email, stripe_customer_id)
    VALUES (p_email, p_stripe_customer_id)
    ON CONFLICT (email) DO UPDATE
      SET stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, provisional_users.stripe_customer_id)
    RETURNING profile_id INTO v_profile_id;
  END IF;

  -- transactions insert
  INSERT INTO transactions (
    stripe_payment_intent_id,
    product_id,
    qr_config_id,
    sender_profile_id,
    sender_email,
    sender_name,
    sender_comment,
    status,
    total_gross_amount,
    stripe_funds_status,
    amount_verified,
    amount_mismatch,
    payment_method,
    stripe_fee,
    platform_fee,
    net_amount
  ) VALUES (
    p_stripe_payment_intent_id,
    p_product_id,
    p_qr_config_id,
    v_profile_id,
    p_email,
    p_sender_name,
    p_sender_comment,
    'completed',
    p_gross,
    'held_in_platform',
    TRUE,
    0,
    p_payment_method,
    p_stripe_fee,
    p_platform_fee,
    p_net_amount
  )
  RETURNING transaction_id INTO v_transaction_id;

  -- エージェント手数料 distribution insert (agent_id が NULL または fee が 0 の場合はスキップ)
  IF p_agent_id IS NOT NULL AND p_agent_fee > 0 AND p_event_id IS NOT NULL THEN
    INSERT INTO transaction_distributions (
      transaction_id,
      event_id,
      profile_id,
      distribution_role,
      actual_amount,
      distribution_status
    ) VALUES (
      v_transaction_id,
      p_event_id,
      p_agent_id,
      'agent',
      p_agent_fee,
      'accrued'
    );
  END IF;

  RETURN QUERY SELECT v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_cheers_payment FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_cheers_payment TO service_role;

-- ============================================================
-- 2. complete_entrance_typeb
--    用途: /api/entrance/complete (TypeB Checkout Session)
--    アトミック: provisional_users upsert + transactions insert + tickets insert
-- ============================================================
CREATE OR REPLACE FUNCTION complete_entrance_typeb(
  p_stripe_payment_intent_id TEXT,
  p_product_id               UUID,
  p_event_id                 UUID,
  p_email                    TEXT,
  p_stripe_customer_id       TEXT,
  p_gross                    BIGINT,
  p_stripe_fee               BIGINT,
  p_platform_fee             BIGINT,
  p_net_amount               BIGINT,
  p_holder_name              TEXT DEFAULT NULL
) RETURNS TABLE(out_transaction_id UUID, out_ticket_id UUID, out_ticket_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
  v_ticket_id      UUID;
  v_ticket_code    TEXT;
  v_profile_id     UUID;
BEGIN
  -- provisional_users upsert
  IF p_email IS NOT NULL THEN
    INSERT INTO provisional_users (email, stripe_customer_id)
    VALUES (p_email, p_stripe_customer_id)
    ON CONFLICT (email) DO UPDATE
      SET stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, provisional_users.stripe_customer_id)
    RETURNING profile_id INTO v_profile_id;
  END IF;

  -- transactions insert
  INSERT INTO transactions (
    stripe_payment_intent_id,
    product_id,
    sender_profile_id,
    sender_email,
    sender_name,
    status,
    total_gross_amount,
    stripe_funds_status,
    amount_verified,
    amount_mismatch,
    stripe_fee,
    platform_fee,
    net_amount
  ) VALUES (
    p_stripe_payment_intent_id,
    p_product_id,
    v_profile_id,
    p_email,
    p_holder_name,
    'completed',
    p_gross,
    'held_in_platform',
    TRUE,
    0,
    p_stripe_fee,
    p_platform_fee,
    p_net_amount
  )
  RETURNING transaction_id INTO v_transaction_id;

  -- tickets insert
  INSERT INTO tickets (
    transaction_id,
    reservation_id,
    product_id,
    event_id,
    email,
    holder_profile_id,
    status
  ) VALUES (
    v_transaction_id,
    NULL,
    p_product_id,
    p_event_id,
    p_email,
    v_profile_id,
    'valid'
  )
  RETURNING ticket_id, ticket_code INTO v_ticket_id, v_ticket_code;

  RETURN QUERY SELECT v_transaction_id, v_ticket_id, v_ticket_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_entrance_typeb FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_entrance_typeb TO service_role;

-- ============================================================
-- 3. complete_entrance_typec_reserve
--    用途: /api/entrance/complete (TypeC SetupIntent 完了時)
--    アトミック: entrance_reservations update + tickets insert
-- ============================================================
CREATE OR REPLACE FUNCTION complete_entrance_typec_reserve(
  p_reservation_id    UUID,
  p_payment_method_id TEXT,
  p_product_id        UUID,
  p_event_id          UUID,
  p_email             TEXT
) RETURNS TABLE(out_ticket_id UUID, out_ticket_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id   UUID;
  v_ticket_code TEXT;
  v_profile_id  UUID;
BEGIN
  -- provisional_users から profile_id を取得
  SELECT profile_id INTO v_profile_id
  FROM provisional_users
  WHERE email = p_email;

  -- entrance_reservations を reserved に更新
  UPDATE entrance_reservations
  SET status                   = 'reserved',
      stripe_payment_method_id = p_payment_method_id
  WHERE reservation_id = p_reservation_id;

  -- tickets insert (TypeC: この時点では transaction_id は null)
  INSERT INTO tickets (
    transaction_id,
    reservation_id,
    product_id,
    event_id,
    email,
    holder_profile_id,
    status
  ) VALUES (
    NULL,
    p_reservation_id,
    p_product_id,
    p_event_id,
    p_email,
    v_profile_id,
    'valid'
  )
  RETURNING ticket_id, ticket_code INTO v_ticket_id, v_ticket_code;

  RETURN QUERY SELECT v_ticket_id, v_ticket_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_entrance_typec_reserve FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_entrance_typec_reserve TO service_role;

-- ============================================================
-- 4. complete_entrance_typea_charge
--    用途: supabase/functions/charge-type-a (TypeA 自動決済バッチ)
--    アトミック: transactions insert + tickets insert + entrance_reservations update
-- ============================================================
CREATE OR REPLACE FUNCTION complete_entrance_typea_charge(
  p_stripe_payment_intent_id TEXT,
  p_product_id               UUID,
  p_event_id                 UUID,
  p_email                    TEXT,
  p_gross                    BIGINT,
  p_stripe_fee               BIGINT,
  p_platform_fee             BIGINT,
  p_net_amount               BIGINT,
  p_reservation_id           UUID
) RETURNS TABLE(out_transaction_id UUID, out_ticket_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
  v_ticket_id      UUID;
  v_profile_id     UUID;
BEGIN
  -- provisional_users から profile_id を取得
  SELECT profile_id INTO v_profile_id
  FROM provisional_users
  WHERE email = p_email;

  -- transactions insert
  INSERT INTO transactions (
    stripe_payment_intent_id,
    product_id,
    sender_profile_id,
    sender_email,
    status,
    total_gross_amount,
    stripe_funds_status,
    amount_verified,
    amount_mismatch,
    stripe_fee,
    platform_fee,
    net_amount
  ) VALUES (
    p_stripe_payment_intent_id,
    p_product_id,
    v_profile_id,
    p_email,
    'completed',
    p_gross,
    'held_in_platform',
    TRUE,
    0,
    p_stripe_fee,
    p_platform_fee,
    p_net_amount
  )
  RETURNING transaction_id INTO v_transaction_id;

  -- tickets insert
  INSERT INTO tickets (
    transaction_id,
    reservation_id,
    product_id,
    event_id,
    email,
    holder_profile_id,
    status
  ) VALUES (
    v_transaction_id,
    p_reservation_id,
    p_product_id,
    p_event_id,
    p_email,
    v_profile_id,
    'valid'
  )
  RETURNING ticket_id INTO v_ticket_id;

  -- entrance_reservations を charged に更新
  UPDATE entrance_reservations
  SET status         = 'charged',
      charged_at     = now(),
      transaction_id = v_transaction_id
  WHERE reservation_id = p_reservation_id;

  RETURN QUERY SELECT v_transaction_id, v_ticket_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_entrance_typea_charge FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_entrance_typea_charge TO service_role;

-- ============================================================
-- 5. complete_entrance_typec_checkin
--    用途: /api/entrance/checkin (TypeC チェックイン時決済)
--    アトミック: transactions insert + entrance_reservations update + tickets update
-- ============================================================
CREATE OR REPLACE FUNCTION complete_entrance_typec_checkin(
  p_stripe_payment_intent_id TEXT,
  p_product_id               UUID,
  p_gross                    BIGINT,
  p_stripe_fee               BIGINT,
  p_platform_fee             BIGINT,
  p_net_amount               BIGINT,
  p_reservation_id           UUID,
  p_ticket_id                UUID
) RETURNS TABLE(out_transaction_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
  v_now            TIMESTAMPTZ := now();
BEGIN
  -- transactions insert
  INSERT INTO transactions (
    stripe_payment_intent_id,
    product_id,
    status,
    total_gross_amount,
    stripe_funds_status,
    amount_verified,
    amount_mismatch,
    stripe_fee,
    platform_fee,
    net_amount
  ) VALUES (
    p_stripe_payment_intent_id,
    p_product_id,
    'completed',
    p_gross,
    'held_in_platform',
    TRUE,
    0,
    p_stripe_fee,
    p_platform_fee,
    p_net_amount
  )
  RETURNING transaction_id INTO v_transaction_id;

  -- entrance_reservations を charged に更新
  UPDATE entrance_reservations
  SET status         = 'charged',
      charged_at     = v_now,
      transaction_id = v_transaction_id
  WHERE reservation_id = p_reservation_id;

  -- tickets に transaction_id をセット
  UPDATE tickets
  SET transaction_id = v_transaction_id
  WHERE ticket_id = p_ticket_id;

  RETURN QUERY SELECT v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_entrance_typec_checkin FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_entrance_typec_checkin TO service_role;

-- ============================================================
-- 6. create_qr_bundle
--    用途: /api/qr/create
--    アトミック: products insert + qr_configs insert + qr_config_targets insert
-- ============================================================
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
  p_targets              JSONB,  -- [{profile_id: uuid, distribution_ratio: numeric}]
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
    CASE WHEN p_product_type = 'entrance' THEN p_payment_type ELSE NULL END,
    CASE WHEN p_product_type = 'entrance' THEN p_stock_limit  ELSE NULL END,
    CASE WHEN p_product_type = 'entrance' THEN p_track_inventory ELSE FALSE END,
    CASE WHEN p_product_type = 'entrance' AND p_payment_type IN ('A','B') THEN p_sales_start_at ELSE NULL END,
    CASE WHEN p_product_type = 'entrance' AND p_payment_type IN ('A','B') THEN p_sales_end_at   ELSE NULL END
  )
  RETURNING product_id INTO v_product_id;

  -- qr_configs insert
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
    CASE WHEN p_product_type = 'entrance' THEN p_strip_image_url ELSE NULL END,
    CASE WHEN p_product_type = 'entrance' THEN p_bg_color        ELSE NULL END,
    CASE WHEN p_product_type = 'entrance' THEN p_fg_color        ELSE NULL END,
    CASE WHEN p_product_type = 'entrance' THEN p_label_color     ELSE NULL END
  )
  RETURNING qr_config_id INTO v_qr_config_id;

  -- qr_config_targets insert (複数行)
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

-- ============================================================
-- 7. handle_chargeback
--    用途: /api/stripe/webhook (charge.dispute.created)
--    アトミック: transaction_distributions freeze + profiles freeze + debt_claims insert
-- ============================================================
CREATE OR REPLACE FUNCTION handle_chargeback(
  p_transaction_id     UUID,
  p_claim_amount       BIGINT,
  p_stripe_dispute_fee INTEGER,
  p_dispute_id         TEXT,
  p_primary_profile_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- accrued distributions を凍結
  UPDATE transaction_distributions
  SET is_frozen = TRUE
  WHERE transaction_id    = p_transaction_id
    AND distribution_status = 'accrued';

  -- 関連プロファイルの残高を凍結 & chargeback_count インクリメント
  UPDATE profiles
  SET balance_frozen     = TRUE,
      balance_frozen_at  = now(),
      chargeback_count   = COALESCE(chargeback_count, 0) + 1
  WHERE profile_id IN (
    SELECT DISTINCT profile_id
    FROM transaction_distributions
    WHERE transaction_id = p_transaction_id
  );

  -- debt_claim を作成
  INSERT INTO debt_claims (
    profile_id,
    original_transaction_id,
    claim_amount,
    stripe_dispute_fee,
    recovered_amount,
    status,
    description
  ) VALUES (
    p_primary_profile_id,
    p_transaction_id,
    p_claim_amount,
    p_stripe_dispute_fee,
    0,
    'active',
    'Stripe dispute: ' || p_dispute_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION handle_chargeback FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION handle_chargeback TO service_role;
