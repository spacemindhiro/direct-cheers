-- ============================================================
-- 1. serial_sequences テーブル（採番カウンター）
--    scope_key 単位でアトミックにインクリメント。
--    INSERT ON CONFLICT DO UPDATE の行ロックで競合を直列化。
-- ============================================================
CREATE TABLE IF NOT EXISTS public.serial_sequences (
  scope_key TEXT    PRIMARY KEY,
  last_seq  INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE  public.serial_sequences IS 'シリアルナンバーのスコープ別カウンター。MAX+1方式を廃止しDB採番に移行。';
COMMENT ON COLUMN public.serial_sequences.scope_key IS '"event:{event_id}" | "qr:{qr_config_id}" | "artist:{event_id}:{artist_id}"';
COMMENT ON COLUMN public.serial_sequences.last_seq  IS '最後に発行したシリアル番号。次回は last_seq + 1 を発行する。';

REVOKE ALL ON public.serial_sequences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.serial_sequences TO service_role;

-- 既存データのバックフィル（sequence_number_in_event が入っているもの）
INSERT INTO public.serial_sequences (scope_key, last_seq)
SELECT
  CASE qc.serial_scope
    WHEN 'qr'     THEN 'qr:'     || t.qr_config_id::text
    WHEN 'artist' THEN 'artist:' || qc.event_id::text
    ELSE               'event:'  || qc.event_id::text
  END            AS scope_key,
  MAX(t.sequence_number_in_event) AS last_seq
FROM public.transactions t
JOIN public.qr_configs   qc ON qc.qr_config_id = t.qr_config_id
WHERE t.sequence_number_in_event IS NOT NULL
GROUP BY scope_key
ON CONFLICT (scope_key) DO UPDATE
  SET last_seq = GREATEST(serial_sequences.last_seq, EXCLUDED.last_seq);

-- ============================================================
-- 2. assign_serial_number — カウンターテーブル版
--    ・serial_sequences を INSERT ON CONFLICT DO UPDATE して採番
--    ・冪等: すでに sequence_number_in_event が付いていたら即 RETURN
--    ・Advisory Lock 廃止（行ロックで競合を直列化）
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_serial_number(
  p_transaction_id  uuid,
  p_event_id        uuid,
  p_artist_id       uuid DEFAULT NULL,
  p_qr_config_id    uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope     text;
  v_scope_key text;
  v_existing  integer;
  v_next_seq  integer;
BEGIN
  -- 冪等チェック: すでに採番済みなら返すだけ
  SELECT sequence_number_in_event
    INTO v_existing
    FROM public.transactions
   WHERE transaction_id = p_transaction_id;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- スコープ取得
  IF p_qr_config_id IS NOT NULL THEN
    SELECT serial_scope INTO v_scope
      FROM public.qr_configs
     WHERE qr_config_id = p_qr_config_id;
  END IF;
  IF v_scope IS NULL THEN
    SELECT serial_scope INTO v_scope
      FROM public.events
     WHERE event_id = p_event_id;
  END IF;
  IF v_scope IS NULL THEN
    v_scope := 'event';
  END IF;

  -- スコープキー生成
  CASE v_scope
    WHEN 'qr'     THEN v_scope_key := 'qr:'     || COALESCE(p_qr_config_id::text, p_event_id::text);
    WHEN 'artist' THEN v_scope_key := 'artist:' || p_event_id::text || ':' || COALESCE(p_artist_id::text, '');
    ELSE               v_scope_key := 'event:'  || p_event_id::text;
  END CASE;

  -- アトミック採番（行ロックによる直列化）
  INSERT INTO public.serial_sequences (scope_key, last_seq)
  VALUES (v_scope_key, 1)
  ON CONFLICT (scope_key) DO UPDATE
    SET last_seq = serial_sequences.last_seq + 1
  RETURNING last_seq INTO v_next_seq;

  -- トランザクションに書き込む
  UPDATE public.transactions
     SET sequence_number_in_event = v_next_seq
   WHERE transaction_id = p_transaction_id;

  RETURN v_next_seq;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_serial_number FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.assign_serial_number TO service_role;

-- ============================================================
-- 3. complete_cheers_payment — 冪等性を復元
--    20260509 のリライトで ON CONFLICT が消えていたため再追加。
--    webhook 先着・pay/complete 後着でも常に transaction_id を返す。
--    v_is_new_row = false の場合は distributions の二重挿入をスキップ。
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_cheers_payment(
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
  v_is_new_row     BOOLEAN;
  v_affected       INTEGER;
  v_target         RECORD;
  v_target_count   INT;
  v_current        INT;
  v_allocated      BIGINT;
  v_amount         BIGINT;
BEGIN
  -- provisional_users upsert
  IF p_email IS NOT NULL THEN
    INSERT INTO provisional_users (email, stripe_customer_id)
    VALUES (p_email, p_stripe_customer_id)
    ON CONFLICT (email) DO UPDATE
      SET stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, provisional_users.stripe_customer_id)
    RETURNING profile_id INTO v_profile_id;
  END IF;

  -- transactions insert（冪等: 同一 payment_intent_id は DO NOTHING）
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
  ON CONFLICT (stripe_payment_intent_id) DO NOTHING;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  v_is_new_row := (v_affected > 0);

  -- 常に transaction_id を取得（新規・既存どちらでも）
  SELECT transaction_id INTO v_transaction_id
    FROM transactions
   WHERE stripe_payment_intent_id = p_stripe_payment_intent_id;

  -- 新規行のみ distributions を挿入（二重挿入防止）
  IF v_is_new_row THEN

    -- エージェント手数料 distribution
    IF p_agent_id IS NOT NULL AND p_agent_fee > 0 AND p_event_id IS NOT NULL THEN
      INSERT INTO transaction_distributions (
        transaction_id, event_id, profile_id, distribution_role, actual_amount, distribution_status
      ) VALUES (
        v_transaction_id, p_event_id, p_agent_id, 'agent', p_agent_fee, 'accrued'
      );
    END IF;

    -- アーティスト・オーガナイザー配分
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

  END IF;

  RETURN QUERY SELECT v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_cheers_payment FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.complete_cheers_payment TO service_role;
