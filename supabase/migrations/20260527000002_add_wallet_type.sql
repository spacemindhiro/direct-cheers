-- transactions.wallet_type: Apple Pay / Google Pay / Stripe Link などの決済ウォレット種別を記録
-- payment_method が 'card' のときに限り stripe が返す wallet.type をそのまま格納
-- 値例: 'apple_pay' | 'google_pay' | 'link' | NULL（手入力カード）

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS wallet_type text NULL;

-- complete_cheers_payment RPC に p_wallet_type を追加（DEFAULT NULL で後方互換）
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
  p_wallet_type              TEXT    DEFAULT NULL
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
    wallet_type,
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
    p_wallet_type,
    p_stripe_fee,
    p_platform_fee,
    p_net_amount
  )
  ON CONFLICT DO NOTHING
  RETURNING transaction_id INTO v_transaction_id;

  -- ON CONFLICT DO NOTHING → 処理済み（呼び出し元が空セット確認して早期 return）
  IF v_transaction_id IS NULL THEN
    RETURN;
  END IF;

  -- エージェント手数料 distribution insert
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

  -- アーティスト・オーガナイザー配分 insert
  -- qr_config_targets を参照し、端数ルールに従って各受取人の actual_amount を確定する
  -- 端数ルール: distribution_ratio DESC → ロール優先度(admin>agent>organizer>artist) → created_at ASC
  -- 最後の1人が残額まるごと受け取る
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
          v_amount := p_net_amount - v_allocated;  -- 残額まるごと（端数吸収）
        ELSE
          v_amount := floor(p_net_amount * v_target.distribution_ratio);
        END IF;

        v_allocated := v_allocated + v_amount;

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
          v_target.profile_id,
          v_target.role,
          v_amount,
          'accrued'
        );
      END LOOP;
    END IF;
  END IF;

  RETURN QUERY SELECT v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_cheers_payment FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_cheers_payment TO service_role;
