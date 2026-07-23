-- ウェルカムチア（2階）の宛先確定RPC。
-- 購入者が演者を選んだ時点で、デフォルト（主催者）向けに計上済みの
-- artist/organizer配分を削除し、選ばれた演者のqr_config_targetsに基づいて
-- 配分を作り直す。agent/platformの配分（手数料）は宛先に関わらず不変のため触れない。
-- 一度確定（welcome_cheer_locked_at設定）したら再確定は不可。

CREATE OR REPLACE FUNCTION confirm_welcome_cheer_recipient(
  p_transaction_id      UUID,
  p_target_product_id   UUID,
  p_target_qr_config_id UUID,
  p_event_id            UUID
) RETURNS TABLE(out_ok BOOLEAN, out_error TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked_at    TIMESTAMPTZ;
  v_net_amount   BIGINT;
  v_target       RECORD;
  v_target_count INT;
  v_current      INT;
  v_allocated    BIGINT;
  v_amount       BIGINT;
BEGIN
  SELECT welcome_cheer_locked_at, net_amount
    INTO v_locked_at, v_net_amount
    FROM transactions
    WHERE transaction_id = p_transaction_id AND stripe_pi_sequence = 1
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'TRANSACTION_NOT_FOUND'::TEXT;
    RETURN;
  END IF;

  IF v_locked_at IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'ALREADY_LOCKED'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM transaction_distributions
    WHERE transaction_id = p_transaction_id AND distribution_status = 'paid'
  ) THEN
    RETURN QUERY SELECT FALSE, 'ALREADY_SETTLED'::TEXT;
    RETURN;
  END IF;

  -- 既存のartist/organizer配分（デフォルト＝主催者宛）を削除し、
  -- 選ばれた演者のqr_config_targetsに基づいて作り直す。agent/platformは不変。
  DELETE FROM transaction_distributions
   WHERE transaction_id = p_transaction_id
     AND distribution_status = 'accrued'
     AND distribution_role NOT IN ('agent', 'platform');

  SELECT COUNT(*) INTO v_target_count
    FROM qr_config_targets
    WHERE qr_config_id = p_target_qr_config_id AND deleted_at IS NULL;

  IF v_target_count > 0 THEN
    v_current   := 0;
    v_allocated := 0;
    FOR v_target IN
      SELECT t.profile_id, t.distribution_ratio, p.role
        FROM qr_config_targets t
        JOIN profiles p ON p.profile_id = t.profile_id
        WHERE t.qr_config_id = p_target_qr_config_id AND t.deleted_at IS NULL
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
        v_amount := v_net_amount - v_allocated;
      ELSE
        v_amount := floor(v_net_amount * v_target.distribution_ratio);
      END IF;
      v_allocated := v_allocated + v_amount;

      INSERT INTO transaction_distributions (
        transaction_id, event_id, profile_id, distribution_role, actual_amount, distribution_status
      ) VALUES (
        p_transaction_id, p_event_id, v_target.profile_id, v_target.role, v_amount, 'accrued'
      );
    END LOOP;
  END IF;

  UPDATE transactions
    SET product_id   = p_target_product_id,
        qr_config_id = p_target_qr_config_id,
        welcome_cheer_locked_at = now()
    WHERE transaction_id = p_transaction_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION confirm_welcome_cheer_recipient FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION confirm_welcome_cheer_recipient TO service_role;
