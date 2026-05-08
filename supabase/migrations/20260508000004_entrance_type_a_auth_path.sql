-- entrance_reservations: 5日以内購入でPaymentIntentを使うパスに対応
-- 1. stripe_setup_intent_id を nullable に（PaymentIntentパスではnull）
-- 2. stripe_payment_intent_id カラム追加
-- 3. complete_entrance_typea_charge: 既存チケットがある場合はUPDATE（SetupIntentパスで即発行済みの場合）

ALTER TABLE entrance_reservations
  ALTER COLUMN stripe_setup_intent_id DROP NOT NULL;

ALTER TABLE entrance_reservations
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text UNIQUE;

-- complete_entrance_typea_charge を更新:
-- SetupIntentパスでチケット発行済みの場合は INSERT ではなく transaction_id を UPDATE する
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
  v_transaction_id     UUID;
  v_ticket_id          UUID;
  v_profile_id         UUID;
  v_existing_ticket_id UUID;
BEGIN
  SELECT profile_id INTO v_profile_id
  FROM provisional_users WHERE email = p_email;

  INSERT INTO transactions (
    stripe_payment_intent_id,
    product_id, sender_profile_id, sender_email,
    status, total_gross_amount, stripe_funds_status,
    amount_verified, amount_mismatch,
    stripe_fee, platform_fee, net_amount
  ) VALUES (
    p_stripe_payment_intent_id,
    p_product_id, v_profile_id, p_email,
    'completed', p_gross, 'held_in_platform',
    TRUE, 0,
    p_stripe_fee, p_platform_fee, p_net_amount
  )
  RETURNING transaction_id INTO v_transaction_id;

  -- SetupIntentパスで即発行済みのチケットがあるか確認
  SELECT ticket_id INTO v_existing_ticket_id
  FROM tickets WHERE reservation_id = p_reservation_id LIMIT 1;

  IF v_existing_ticket_id IS NOT NULL THEN
    -- 既存チケットに transaction_id を紐付けるだけ
    UPDATE tickets SET transaction_id = v_transaction_id
    WHERE ticket_id = v_existing_ticket_id;
    v_ticket_id := v_existing_ticket_id;
  ELSE
    INSERT INTO tickets (
      transaction_id, reservation_id, product_id, event_id,
      email, holder_profile_id, status
    ) VALUES (
      v_transaction_id, p_reservation_id, p_product_id, p_event_id,
      p_email, v_profile_id, 'valid'
    )
    RETURNING ticket_id INTO v_ticket_id;
  END IF;

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
