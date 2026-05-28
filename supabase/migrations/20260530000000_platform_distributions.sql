-- platform fee を admin の transaction_distributions として記録する
--
-- 変更点:
--   1. 4つの決済RPCにplatform distribution INSERTを追加
--      distribution_role = 'platform', profile_id = adminのUUID
--   2. handle_chargebackのフリーズ対象からplatformを除外
--      （platform feeはStripeが直接回収するため凍結不要）

-- ============================================================
-- 1. complete_cheers_payment（Cheers決済）
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
  v_admin_id       UUID;
BEGIN
  IF p_email IS NOT NULL THEN
    INSERT INTO provisional_users (email, stripe_customer_id)
    VALUES (p_email, p_stripe_customer_id)
    ON CONFLICT (email) DO UPDATE
      SET stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, provisional_users.stripe_customer_id)
    RETURNING profile_id INTO v_profile_id;
  END IF;

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

  IF p_agent_id IS NOT NULL AND p_agent_fee > 0 AND p_event_id IS NOT NULL THEN
    INSERT INTO transaction_distributions (
      transaction_id, event_id, profile_id, distribution_role, actual_amount, distribution_status
    ) VALUES (
      v_transaction_id, p_event_id, p_agent_id, 'agent', p_agent_fee, 'accrued'
    );
  END IF;

  -- admin の platform fee distribution（event_idが存在する場合のみ）
  IF p_platform_fee > 0 AND p_event_id IS NOT NULL THEN
    SELECT profile_id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO transaction_distributions (
        transaction_id, event_id, profile_id, distribution_role, actual_amount, distribution_status
      ) VALUES (
        v_transaction_id, p_event_id, v_admin_id, 'platform', p_platform_fee, 'accrued'
      );
    END IF;
  END IF;

  RETURN QUERY SELECT v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_cheers_payment FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_cheers_payment TO service_role;

-- ============================================================
-- 2. complete_entrance_typeb（TypeB入場チケット）
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
  v_admin_id       UUID;
BEGIN
  IF p_email IS NOT NULL THEN
    INSERT INTO provisional_users (email, stripe_customer_id)
    VALUES (p_email, p_stripe_customer_id)
    ON CONFLICT (email) DO UPDATE
      SET stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, provisional_users.stripe_customer_id)
    RETURNING profile_id INTO v_profile_id;
  END IF;

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

  INSERT INTO tickets (
    transaction_id, reservation_id, product_id, event_id, email, holder_profile_id, status
  ) VALUES (
    v_transaction_id, NULL, p_product_id, p_event_id, p_email, v_profile_id, 'valid'
  )
  RETURNING ticket_id, ticket_code INTO v_ticket_id, v_ticket_code;

  -- admin の platform fee distribution
  IF p_platform_fee > 0 THEN
    SELECT profile_id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO transaction_distributions (
        transaction_id, event_id, profile_id, distribution_role, actual_amount, distribution_status
      ) VALUES (
        v_transaction_id, p_event_id, v_admin_id, 'platform', p_platform_fee, 'accrued'
      );
    END IF;
  END IF;

  RETURN QUERY SELECT v_transaction_id, v_ticket_id, v_ticket_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_entrance_typeb FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_entrance_typeb TO service_role;

-- ============================================================
-- 3. complete_entrance_typea_charge（TypeA自動決済）
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
  v_admin_id       UUID;
BEGIN
  SELECT profile_id INTO v_profile_id FROM provisional_users WHERE email = p_email;

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

  INSERT INTO tickets (
    transaction_id, reservation_id, product_id, event_id, email, holder_profile_id, status
  ) VALUES (
    v_transaction_id, p_reservation_id, p_product_id, p_event_id, p_email, v_profile_id, 'valid'
  )
  RETURNING ticket_id INTO v_ticket_id;

  UPDATE entrance_reservations
  SET status = 'charged', charged_at = now(), transaction_id = v_transaction_id
  WHERE reservation_id = p_reservation_id;

  -- admin の platform fee distribution
  IF p_platform_fee > 0 THEN
    SELECT profile_id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO transaction_distributions (
        transaction_id, event_id, profile_id, distribution_role, actual_amount, distribution_status
      ) VALUES (
        v_transaction_id, p_event_id, v_admin_id, 'platform', p_platform_fee, 'accrued'
      );
    END IF;
  END IF;

  RETURN QUERY SELECT v_transaction_id, v_ticket_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_entrance_typea_charge FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_entrance_typea_charge TO service_role;

-- ============================================================
-- 4. complete_entrance_typec_checkin（TypeCチェックイン決済）
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
  v_event_id       UUID;
  v_admin_id       UUID;
BEGIN
  -- event_id をチケットから取得（platform distribution に使用）
  SELECT event_id INTO v_event_id FROM tickets WHERE ticket_id = p_ticket_id;

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

  UPDATE entrance_reservations
  SET status = 'charged', charged_at = v_now, transaction_id = v_transaction_id
  WHERE reservation_id = p_reservation_id;

  UPDATE tickets SET transaction_id = v_transaction_id WHERE ticket_id = p_ticket_id;

  -- admin の platform fee distribution（event_idが取れた場合のみ）
  IF p_platform_fee > 0 AND v_event_id IS NOT NULL THEN
    SELECT profile_id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO transaction_distributions (
        transaction_id, event_id, profile_id, distribution_role, actual_amount, distribution_status
      ) VALUES (
        v_transaction_id, v_event_id, v_admin_id, 'platform', p_platform_fee, 'accrued'
      );
    END IF;
  END IF;

  RETURN QUERY SELECT v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_entrance_typec_checkin FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_entrance_typec_checkin TO service_role;

-- ============================================================
-- 5. handle_chargeback: platformをフリーズ対象から除外
--    platform feeはStripeが直接プラットフォームアカウントから回収するため
--    distribution凍結・profile凍結ともに不要
-- ============================================================
CREATE OR REPLACE FUNCTION handle_chargeback(
  p_transaction_id        UUID,
  p_claim_amount          BIGINT,
  p_stripe_dispute_fee    INTEGER,
  p_dispute_id            TEXT,
  p_primary_profile_id    UUID,
  p_stripe_processing_fee BIGINT DEFAULT 0,
  p_platform_fee_held     BIGINT DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM debt_claims WHERE stripe_dispute_id = p_dispute_id) THEN
    RETURN;
  END IF;

  -- platform以外の distributions を凍結（platformはStripeが直接回収）
  UPDATE transaction_distributions
  SET is_frozen = TRUE
  WHERE transaction_id      = p_transaction_id
    AND distribution_status IN ('accrued', 'paid')
    AND distribution_role  != 'platform';

  -- platform以外のプロファイルの残高を凍結
  UPDATE profiles
  SET balance_frozen    = TRUE,
      balance_frozen_at = now(),
      chargeback_count  = COALESCE(chargeback_count, 0) + 1
  WHERE profile_id IN (
    SELECT DISTINCT profile_id
    FROM transaction_distributions
    WHERE transaction_id   = p_transaction_id
      AND distribution_role != 'platform'
  );

  INSERT INTO debt_claims (
    profile_id,
    original_transaction_id,
    claim_amount,
    stripe_dispute_fee,
    stripe_processing_fee,
    platform_fee_held,
    stripe_dispute_id,
    recovered_amount,
    status,
    description
  ) VALUES (
    p_primary_profile_id,
    p_transaction_id,
    p_claim_amount,
    p_stripe_dispute_fee,
    p_stripe_processing_fee,
    p_platform_fee_held,
    p_dispute_id,
    0,
    'active',
    'Stripe dispute: ' || p_dispute_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION handle_chargeback(UUID, BIGINT, INTEGER, TEXT, UUID, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION handle_chargeback(UUID, BIGINT, INTEGER, TEXT, UUID, BIGINT, BIGINT) TO service_role;
