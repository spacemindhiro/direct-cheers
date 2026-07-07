-- products.payment_type の CHECK制約に 'V'（Voucher）を追加
-- custom タイプの最初のサブパターンとして導入
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_payment_type_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_payment_type_check
  CHECK (payment_type IN ('A', 'B', 'C', 'V'));
