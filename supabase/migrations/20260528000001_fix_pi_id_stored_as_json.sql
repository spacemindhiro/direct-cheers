-- stripe_payment_intent_id に PI オブジェクト全体の JSON が入っているレコードを修正
-- pay/complete で expand した PaymentIntent オブジェクトをそのまま保存していたバグの修正
UPDATE transactions
SET stripe_payment_intent_id = (stripe_payment_intent_id::jsonb)->>'id'
WHERE stripe_payment_intent_id LIKE '{%'
  AND (stripe_payment_intent_id::jsonb)->>'id' IS NOT NULL;
