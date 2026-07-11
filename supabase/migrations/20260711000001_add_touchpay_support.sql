-- 当日現地タッチ決済（Stripe Terminal / card_present）対応。
-- 決済成功時点ではアカウントが無い客がほとんどのため、sender/holderをNULLのまま
-- transactions・ticketsを作成し、Stripeのcard fingerprintで後から名寄せする。

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS card_fingerprint TEXT;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS card_fingerprint TEXT,
  ALTER COLUMN email DROP NOT NULL;

-- ==========================================
-- RPC: タッチ決済完了時のアトミック書き込み
-- complete_cheers_payment と同じ配分ロジック（qr_config_targetsベース）を踏襲するが、
-- sender情報は常にNULL（匿名）、card_fingerprintを保存する点のみ異なる。
-- ==========================================
CREATE OR REPLACE FUNCTION complete_touchpay_payment(
  p_stripe_payment_intent_id TEXT,
  p_product_id               UUID,
  p_qr_config_id             UUID,
  p_gross                    BIGINT,
  p_stripe_fee               BIGINT,
  p_platform_fee             BIGINT,
  p_net_amount               BIGINT,
  p_event_id                 UUID,
  p_agent_id                 UUID    DEFAULT NULL,
  p_agent_fee                BIGINT  DEFAULT 0,
  p_device_name              TEXT    DEFAULT NULL,
  p_card_fingerprint         TEXT    DEFAULT NULL
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
    card_fingerprint
  ) VALUES (
    p_stripe_payment_intent_id,
    p_product_id,
    p_qr_config_id,
    NULL,
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
    p_card_fingerprint
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
  TEXT, UUID, UUID, BIGINT, BIGINT, BIGINT, BIGINT, UUID, UUID, BIGINT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_touchpay_payment(
  TEXT, UUID, UUID, BIGINT, BIGINT, BIGINT, BIGINT, UUID, UUID, BIGINT, TEXT, TEXT
) TO service_role;

-- ==========================================
-- RPC: card_fingerprintによる匿名チケット・取引の名寄せ
-- サインアップ完了時に、同じfingerprintを持つ過去の匿名決済を一括で本人に紐付ける。
-- ガード条件（fingerprint未設定・空文字の行は対象外）は絶対に外さないこと。
-- ==========================================
CREATE OR REPLACE FUNCTION reconcile_anonymous_tickets_by_fingerprint(
  p_fingerprint TEXT,
  p_profile_id  UUID,
  p_email       TEXT
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF p_fingerprint IS NULL OR p_fingerprint = '' THEN
    RETURN 0;
  END IF;

  UPDATE tickets
     SET holder_profile_id = p_profile_id,
         email             = p_email,
         updated_at        = now()
   WHERE holder_profile_id IS NULL
     AND card_fingerprint = p_fingerprint
     AND card_fingerprint IS NOT NULL
     AND card_fingerprint <> '';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE transactions
     SET sender_profile_id = p_profile_id,
         sender_email      = p_email,
         updated_at        = now()
   WHERE sender_profile_id IS NULL
     AND card_fingerprint = p_fingerprint
     AND card_fingerprint IS NOT NULL
     AND card_fingerprint <> '';

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION reconcile_anonymous_tickets_by_fingerprint(TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reconcile_anonymous_tickets_by_fingerprint(TEXT, UUID, TEXT) TO service_role;
