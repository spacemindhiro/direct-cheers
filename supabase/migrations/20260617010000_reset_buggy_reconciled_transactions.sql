-- Bug 2 修正（照合スケール対象にplatformを誤って含めていた）による
-- organizer分配額の誤算を修正するため、影響を受けた取引のreconciled_atをリセットする。
--
-- 判定条件:
--   platform distribution に amount_before_reconcile が入っている
--   = 照合実行時にplatformが誤ってスケール対象になった証拠
--
-- リセット後、admin照合画面の「照合実行」で正しいorganizer金額に再計算される。
-- (Bug 1 マイグレーションでplatform actual_amountは補正済みのため、
--  再照合時にplatformは固定額として除外され、organizerのみが正しく調整される)

UPDATE transactions
SET
  reconciled_at     = NULL,
  amount_verified   = NULL,
  stripe_fee_actual = NULL,
  stripe_net_actual = NULL,
  reconcile_error   = NULL
WHERE status = 'completed'
  AND reconciled_at IS NOT NULL
  AND transaction_id IN (
    SELECT DISTINCT td.transaction_id
    FROM transaction_distributions td
    WHERE td.distribution_role = 'platform'
      AND td.amount_before_reconcile IS NOT NULL
  );
