-- 1回のStripe決済（PaymentIntent）に対して複数のtransactions行を対応させるための
-- 連番列。ウェルカムチア（エントランス決済に内包された2階部分）で、同一PIに対して
-- 1階（エントランス本体）・2階（ウェルカムチア）の2行を作る必要が生じたため導入。
--
-- product_id を複合キーの一部にする案もあったが、「1決済で同一商品を複数計上したい」
-- という将来のケースを塞いでしまうため、product_id とは独立した連番方式にした。
-- 既存の全フロー（1PI=1行）はデフォルト0のまま、今まで通り一意性が保たれる。

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS stripe_pi_sequence INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.transactions.stripe_pi_sequence IS
  '同一stripe_payment_intent_idに対する行の連番。通常の決済は0のみ。ウェルカムチアのように1回の決済で複数transactionsを作る場合、0=1階（アンカー行）、1=2階…と割り当てる。';

DROP INDEX IF EXISTS transactions_stripe_pi_unique;

CREATE UNIQUE INDEX transactions_stripe_pi_unique
  ON public.transactions (stripe_payment_intent_id, stripe_pi_sequence)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- 初期スキーマ（20260409204650_remote_schema.sql）由来の、より古い単純UNIQUE制約
-- transactions_stripe_payment_intent_id_key が stripe_payment_intent_id 単独に
-- 今も残っており、上記の複合UNIQUEを追加しただけでは同一PI・複数行の insert が
-- 依然としてブロックされる。この制約は複合UNIQUEに完全に置き換えられるため削除する。
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_stripe_payment_intent_id_key;
