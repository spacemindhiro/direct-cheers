-- 子機モード演出・端末管理アップデート（6月ローンチ対応）
-- どの端末（タブレット）経由の決済かをtransactionsに記録する
--
-- 変更点:
--   1. transactions に device_name カラムを追加
--   2. complete_cheers_payment: 16引数版をDROPし、p_device_nameを追加した17引数版に統合
--      （20260530000000_platform_distributions と同じ DROP→CREATE OR REPLACE→REVOKE/GRANT パターン）

-- ============================================================
-- 1. transactions.device_name
-- ============================================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS device_name TEXT;

-- ============================================================
-- 2. complete_cheers_payment
--    旧16引数版（p_device_nameなし）をDROPしてからOR REPLACEで統合
-- ============================================================
DROP FUNCTION IF EXISTS complete_cheers_payment(
  TEXT, UUID, UUID, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, BIGINT,
  TEXT, TEXT, TEXT,
  UUID, UUID, BIGINT, TEXT
);

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
  p_agent_fee                BIGINT  DEFAULT 0,
  p_wallet_type              TEXT    DEFAULT NULL,
  p_device_name              TEXT    DEFAULT NULL
) RETURNS TABLE(out_transaction_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
  v_profile_id     UUID;
  v_target         RECORD;
  v_target_count   INT;
  v_current        INT;
  v_allocated      BIGINT;
  v_amount         BIGINT;
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
    wallet_type,
    stripe_fee,
    platform_fee,
    net_amount,
    device_name
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
    p_wallet_type,
    p_stripe_fee,
    p_platform_fee,
    p_net_amount,
    p_device_name
  )
  ON CONFLICT DO NOTHING
  RETURNING transaction_id INTO v_transaction_id;

  IF v_transaction_id IS NULL THEN
    RETURN;
  END IF;

  -- エージェント手数料 distribution
  IF p_agent_id IS NOT NULL AND p_agent_fee > 0 AND p_event_id IS NOT NULL THEN
    INSERT INTO transaction_distributions (
      transaction_id, event_id, profile_id, distribution_role, actual_amount, distribution_status
    ) VALUES (
      v_transaction_id, p_event_id, p_agent_id, 'agent', p_agent_fee, 'accrued'
    );
  END IF;

  -- アーティスト・オーガナイザー配分（端数ルール: 最後の1人が残額を受け取る）
  IF p_qr_config_id IS NOT NULL AND p_event_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_target_count
      FROM qr_config_targets
      WHERE qr_config_id = p_qr_config_id AND deleted_at IS NULL;

    IF v_target_count > 0 THEN
      v_current   := 0;
      v_allocated := 0;

      FOR v_target IN
        SELECT t.profile_id, t.distribution_ratio, p.role
          FROM qr_config_targets t
          JOIN profiles p ON p.profile_id = t.profile_id
          WHERE t.qr_config_id = p_qr_config_id AND t.deleted_at IS NULL
          ORDER BY
            t.distribution_ratio DESC,
            CASE p.role
              WHEN 'admin'     THEN 0
              WHEN 'agent'     THEN 1
              WHEN 'organizer' THEN 2
              WHEN 'artist'    THEN 3
              ELSE                  4
            END ASC,
            t.created_at ASC
      LOOP
        v_current := v_current + 1;
        IF v_current = v_target_count THEN
          v_amount := p_net_amount - v_allocated;
        ELSE
          v_amount := floor(p_net_amount * v_target.distribution_ratio);
        END IF;
        v_allocated := v_allocated + v_amount;

        INSERT INTO transaction_distributions (
          transaction_id, event_id, profile_id, distribution_role, actual_amount, distribution_status
        ) VALUES (
          v_transaction_id, p_event_id, v_target.profile_id, v_target.role, v_amount, 'accrued'
        );
      END LOOP;
    END IF;
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

REVOKE EXECUTE ON FUNCTION complete_cheers_payment(
  TEXT, UUID, UUID, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, BIGINT,
  TEXT, TEXT, TEXT,
  UUID, UUID, BIGINT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION complete_cheers_payment(
  TEXT, UUID, UUID, TEXT, TEXT,
  BIGINT, BIGINT, BIGINT, BIGINT,
  TEXT, TEXT, TEXT,
  UUID, UUID, BIGINT, TEXT, TEXT
) TO service_role;
