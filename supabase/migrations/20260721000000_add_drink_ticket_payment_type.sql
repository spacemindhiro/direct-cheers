-- products.payment_type の CHECK制約に 'D'（Drink Ticket）を追加
-- custom タイプのサブパターン（バウチャー'V'と同じ枠組み）として導入。
-- QRを使わない即時受け渡し型の商品（例: バーカウンターのドリンクチケット）。
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_payment_type_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_payment_type_check
  CHECK (payment_type IN ('A', 'B', 'C', 'V', 'D'));

-- まとめ買い割引ティア。[{ "min_quantity": 3, "unit_price": 500 }, ...] の配列。
-- min_quantity=1（通常単価）は products.min_amount(=max_amount) を参照するため、
-- ここには含めない。NULL/空配列 = 割引なし。
ALTER TABLE public.products
  ADD COLUMN quantity_selectable boolean NOT NULL DEFAULT true,
  ADD COLUMN bulk_pricing jsonb;

COMMENT ON COLUMN public.products.quantity_selectable IS
  'ドリンクチケット等: 決済画面で杯数（数量）を選ばせるか。falseなら常に数量1固定。';
COMMENT ON COLUMN public.products.bulk_pricing IS
  'ドリンクチケット等: まとめ買い割引ティア配列 [{min_quantity, unit_price}, ...]。min_quantity>=2、昇順、unit_priceは非増加。NULLなら割引なし。';
