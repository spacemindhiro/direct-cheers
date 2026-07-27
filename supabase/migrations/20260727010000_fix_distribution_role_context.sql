-- complete_cheers_payment / complete_touchpay_payment の distribution_role 誤判定を修正。
--
-- 従来は qr_config_targets の受取人プロフィールの「profiles.role（システム全体での
-- 本人のロール）」をそのまま distribution_role として使っていた。これは大抵の場合
-- 一致する（オーガナイザーは大抵 role='organizer'、アーティストは role='artist'）が、
-- 「エージェントロールの人物が、同時に別イベントのオーガナイザー取り分の受取人にも
-- なっている」ケース（オーガナイザー兼エージェントは一般的なケース）で、本来
-- organizerとして払うべき配分行まで distribution_role='agent' として記録してしまい、
-- 正規のエージェント手数料行（同じprofile・同じtransaction・同じdistribution_role='agent'）
-- と衝突していた。
--
-- qr_config_targets 自体はどのロールとしての配分かを持たないが、qr_configs.recipient_name_context
-- （'organizer' / 'artist'）が既に「このQRの受取人をどちらの立場として扱うか」を
-- 表現している（lib/statement-descriptor.ts の resolveStatementDescriptorSource 等で
-- 既に同じ目的に使われている実績のあるフィールド）。distribution_roleの判定も
-- プロフィールのグローバルroleではなく、この recipient_name_context に基づいて行う。
--
-- agent・admin(platform)の配分は元々このループとは別の専用パラメータ(p_agent_id/
-- p_agent_fee、platform_fee)で処理されており、qr_config_targets 経由の配分が
-- 'agent'/'admin' になることはそもそも想定されていない。

DROP FUNCTION IF EXISTS complete_touchpay_payment(
  TEXT, UUID, UUID, BIGINT, BIGINT, BIGINT, BIGINT, UUID, UUID, BIGINT, TEXT, TEXT, UUID, INTEGER
);
DROP FUNCTION IF EXISTS complete_cheers_payment(
  TEXT, UUID, UUID, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, UUID, UUID, BIGINT, TEXT, TEXT, INTEGER
);

CREATE OR REPLACE FUNCTION complete_touchpay_payment(
  p_stripe_payment_intent_id TEXT,
  p_product_id               UUID,
  p_qr_config_id             UUID,
  p_gross                    BIGINT,
  p_stripe_fee               BIGINT,
  p_platform_fee             BIGINT,
  p_net_amount                BIGINT,
  p_event_id                 UUID,
  p_agent_id                 UUID    DEFAULT NULL,
  p_agent_fee                BIGINT  DEFAULT 0,
  p_device_name              TEXT    DEFAULT NULL,
  p_card_fingerprint         TEXT    DEFAULT NULL,
  p_known_profile_id         UUID    DEFAULT NULL,
  p_stripe_pi_sequence       INTEGER DEFAULT 0
) RETURNS TABLE(out_transaction_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
  v_target         RECORD;
  v_target_count   INT;
  v_current        INT;
  v_allocated      BIGINT;
  v_amount         BIGINT;
  v_admin_id       UUID;
BEGIN
  INSERT INTO transactions (
    stripe_payment_intent_id,
    product_id,
    qr_config_id,
    sender_profile_id,
    sender_email,
    status,
    total_gross_amount,
    stripe_funds_status,
    amount_verified,
    amount_mismatch,
    payment_method,
    stripe_fee,
    platform_fee,
    net_amount,
    device_name,
    card_fingerprint,
    stripe_pi_sequence
  ) VALUES (
    p_stripe_payment_intent_id,
    p_product_id,
    p_qr_config_id,
    p_known_profile_id,
    NULL,
    'completed',
    p_gross,
    'held_in_platform',
    TRUE,
    0,
    'card',
    p_stripe_fee,
    p_platform_fee,
    p_net_amount,
    p_device_name,
    p_card_fingerprint,
    p_stripe_pi_sequence
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
  -- distribution_role は受取人プロフィールのグローバルroleではなく、
  -- qr_configs.recipient_name_context（このQRをorganizer名義/artist名義の
  -- どちらとして扱うか）から決める。
  IF p_qr_config_id IS NOT NULL AND p_event_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_target_count
      FROM qr_config_targets t
      WHERE t.qr_config_id = p_qr_config_id AND t.deleted_at IS NULL;

    IF v_target_count > 0 THEN
      v_current   := 0;
      v_allocated := 0;

      FOR v_target IN
        SELECT t.profile_id, t.distribution_ratio,
               COALESCE(NULLIF(qc.recipient_name_context, ''), 'artist') AS role
          FROM qr_config_targets t
          JOIN qr_configs qc ON qc.qr_config_id = t.qr_config_id
          WHERE t.qr_config_id = p_qr_config_id AND t.deleted_at IS NULL
          ORDER BY
            t.distribution_ratio DESC,
            CASE COALESCE(NULLIF(qc.recipient_name_context, ''), 'artist')
              WHEN 'organizer' THEN 0
              WHEN 'artist'    THEN 1
              ELSE                  2
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

  -- admin の platform fee distribution
  IF p_platform_fee > 0 AND p_event_id IS NOT NULL THEN
    SELECT profile_id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO transaction_distributions (
        transaction_id, event_id, profile_id, distribution_role, actual_amount, distribution_status
      ) VALUES (
        v_transaction_id, p_event_id, v_admin_id, 'platform', p_platform_fee - p_agent_fee, 'accrued'
      );
    END IF;
  END IF;

  RETURN QUERY SELECT v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_touchpay_payment(
  TEXT, UUID, UUID, BIGINT, BIGINT, BIGINT, BIGINT, UUID, UUID, BIGINT, TEXT, TEXT, UUID, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_touchpay_payment(
  TEXT, UUID, UUID, BIGINT, BIGINT, BIGINT, BIGINT, UUID, UUID, BIGINT, TEXT, TEXT, UUID, INTEGER
) TO service_role;

CREATE OR REPLACE FUNCTION complete_cheers_payment(
  p_stripe_payment_intent_id TEXT,
  p_product_id               UUID,
  p_qr_config_id             UUID,
  p_email                    TEXT,
  p_stripe_customer_id       TEXT,
  p_gross                    BIGINT,
  p_stripe_fee               BIGINT,
  p_platform_fee             BIGINT,
  p_net_amount                BIGINT,
  p_payment_method           TEXT    DEFAULT 'card',
  p_sender_name              TEXT    DEFAULT NULL,
  p_sender_comment           TEXT    DEFAULT NULL,
  p_event_id                 UUID    DEFAULT NULL,
  p_agent_id                 UUID    DEFAULT NULL,
  p_agent_fee                BIGINT  DEFAULT 0,
  p_wallet_type              TEXT    DEFAULT NULL,
  p_device_name              TEXT    DEFAULT NULL,
  p_stripe_pi_sequence       INTEGER DEFAULT 0
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
    device_name,
    stripe_pi_sequence
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
    p_device_name,
    p_stripe_pi_sequence
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
  -- distribution_role は受取人プロフィールのグローバルroleではなく、
  -- qr_configs.recipient_name_context（このQRをorganizer名義/artist名義の
  -- どちらとして扱うか）から決める。
  IF p_qr_config_id IS NOT NULL AND p_event_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_target_count
      FROM qr_config_targets t
      WHERE t.qr_config_id = p_qr_config_id AND t.deleted_at IS NULL;

    IF v_target_count > 0 THEN
      v_current   := 0;
      v_allocated := 0;

      FOR v_target IN
        SELECT t.profile_id, t.distribution_ratio,
               COALESCE(NULLIF(qc.recipient_name_context, ''), 'artist') AS role
          FROM qr_config_targets t
          JOIN qr_configs qc ON qc.qr_config_id = t.qr_config_id
          WHERE t.qr_config_id = p_qr_config_id AND t.deleted_at IS NULL
          ORDER BY
            t.distribution_ratio DESC,
            CASE COALESCE(NULLIF(qc.recipient_name_context, ''), 'artist')
              WHEN 'organizer' THEN 0
              WHEN 'artist'    THEN 1
              ELSE                  2
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

  -- admin の platform fee distribution
  -- agent_fee は platform_fee の内訳として払うため、admin の取り分は platform_fee - agent_fee
  IF p_platform_fee > 0 AND p_event_id IS NOT NULL THEN
    SELECT profile_id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO transaction_distributions (
        transaction_id, event_id, profile_id, distribution_role, actual_amount, distribution_status
      ) VALUES (
        v_transaction_id, p_event_id, v_admin_id, 'platform', p_platform_fee - p_agent_fee, 'accrued'
      );
    END IF;
  END IF;

  RETURN QUERY SELECT v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_cheers_payment(
  TEXT, UUID, UUID, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, UUID, UUID, BIGINT, TEXT, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_cheers_payment(
  TEXT, UUID, UUID, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT, TEXT, TEXT, UUID, UUID, BIGINT, TEXT, TEXT, INTEGER
) TO service_role;
