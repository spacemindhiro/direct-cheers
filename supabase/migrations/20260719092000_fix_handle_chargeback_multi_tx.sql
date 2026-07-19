-- handle_chargeback の冪等性チェックを (stripe_dispute_id) 単独から
-- (stripe_dispute_id, original_transaction_id) の組に変更する。
--
-- 背景: ウェルカムチア導入により、1つのStripe決済（PaymentIntent）に対して
-- 1階・2階の2つのtransactions行が作られるケースが生じる。1つのchargeback
-- （dispute）は同一PIの全transactionsに対して個別に凍結・debt_claim計上を
-- 行う必要があるが、旧実装は「同一dispute_idの debt_claims が1件でもあれば
-- 即return」という判定だったため、2回目（2階分）の呼び出しが無条件で
-- スキップされ、2階側の凍結・請求計上が漏れる欠陥があった。

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
  -- 冪等チェック: 同一dispute×同一transactionの組み合わせが既に処理済みなら何もしない
  IF EXISTS (
    SELECT 1 FROM debt_claims
    WHERE stripe_dispute_id = p_dispute_id
      AND original_transaction_id = p_transaction_id
  ) THEN
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
    WHERE transaction_id    = p_transaction_id
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

REVOKE EXECUTE ON FUNCTION handle_chargeback FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION handle_chargeback TO service_role;
