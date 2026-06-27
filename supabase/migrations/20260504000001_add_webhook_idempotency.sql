-- Webhook の冪等性・障害ログ強化
-- 1. transactions.stripe_payment_intent_id に部分ユニークインデックス（NULL を除く）
-- 2. webhook_failure_logs テーブル（ロールバック発生時の証跡）
-- 3. complete_cheers_payment を ON CONFLICT 対応に更新
-- 4. handle_chargeback に冪等性チェックを追加

-- ============================================================
-- 1. transactions 冪等インデックス
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS transactions_stripe_pi_unique
  ON public.transactions (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ============================================================
-- 2. webhook_failure_logs
--    ロールバック / エラー発生時に 1 円単位で追跡可能にする
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_failure_logs (
  id                BIGSERIAL    PRIMARY KEY,
  occurred_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  stripe_event_id   TEXT,
  event_type        TEXT         NOT NULL,
  payment_intent_id TEXT,
  amount_jpy        BIGINT,
  error_detail      TEXT,
  resolved          BOOLEAN      NOT NULL DEFAULT false
);

COMMENT ON TABLE  public.webhook_failure_logs IS 'Stripe Webhook 処理失敗・ロールバック時の証跡ログ。DB 側でのロールバックが発生した場合でもこのテーブルへの書き込みは別トランザクションで行われる。';
COMMENT ON COLUMN public.webhook_failure_logs.error_detail   IS 'PostgreSQL エラーメッセージ全文（SQLERRM 含む）';
COMMENT ON COLUMN public.webhook_failure_logs.resolved       IS '手動調査・対応済みになったら true にセット';

-- RLS 無効（サービスロールのみ書き込む想定）
ALTER TABLE public.webhook_failure_logs DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.webhook_failure_logs TO service_role;

-- ============================================================
-- 3. complete_cheers_payment を冪等対応に更新
--    stripe_payment_intent_id の重複 INSERT 時は DO NOTHING し
--    out_transaction_id = NULL を返す（呼び出し元が判定する）
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
  ON CONFLICT (stripe_payment_intent_id) DO NOTHING
  RETURNING transaction_id INTO v_transaction_id;

  -- v_transaction_id が NULL = 既に処理済み（冪等リターン）
  IF v_transaction_id IS NULL THEN
    RETURN; -- 呼び出し元は空セットを確認して処理済みと判断する
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

  RETURN QUERY SELECT v_transaction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_cheers_payment FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION complete_cheers_payment TO service_role;

-- ============================================================
-- 4. handle_chargeback を冪等対応に更新
--    同一 transaction_id の debt_claim が既にあれば何もしない
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
  -- 冪等チェック: 同一トランザクションの紛争が既に登録済みなら何もしない
  IF EXISTS (
    SELECT 1 FROM debt_claims
    WHERE original_transaction_id = p_transaction_id
  ) THEN
    RETURN;
  END IF;

  -- accrued distributions を凍結
  UPDATE transaction_distributions
  SET is_frozen = TRUE
  WHERE transaction_id      = p_transaction_id
    AND distribution_status = 'accrued';

  -- 関連プロファイルの残高を凍結 & chargeback_count インクリメント
  UPDATE profiles
  SET balance_frozen    = TRUE,
      balance_frozen_at = now(),
      chargeback_count  = COALESCE(chargeback_count, 0) + 1
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
