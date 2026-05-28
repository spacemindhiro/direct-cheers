-- debt_claims にチャージバック回収追跡用カラムを追加
ALTER TABLE public.debt_claims
  ADD COLUMN IF NOT EXISTS stripe_processing_fee bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_held      bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_dispute_id      text,
  ADD COLUMN IF NOT EXISTS recovered_via_reversal bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reversal_details       jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS debt_claims_dispute_id_idx
  ON public.debt_claims(stripe_dispute_id)
  WHERE stripe_dispute_id IS NOT NULL;

-- handle_chargeback RPC 更新
--   変更点:
--   1. accrued に加え paid な明細も凍結（settle済み分も回収対象）
--   2. stripe_dispute_id を保存（dispute.closed での lookup に使用）
--   3. stripe_processing_fee / platform_fee_held を記録
--   4. stripe_dispute_id による冪等チェック（二重処理防止）
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
  -- 冪等チェック: 同じdispute_idが既に処理済みならスキップ
  IF EXISTS (SELECT 1 FROM debt_claims WHERE stripe_dispute_id = p_dispute_id) THEN
    RETURN;
  END IF;

  -- accrued AND paid な distributions を凍結
  UPDATE transaction_distributions
  SET is_frozen = TRUE
  WHERE transaction_id      = p_transaction_id
    AND distribution_status IN ('accrued', 'paid');

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
