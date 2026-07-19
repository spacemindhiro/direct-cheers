-- ウェルカムチア機能: エントランス決済（タッチ決済・当日QR自己決済）に、
-- 演者への投げ銭（チア）を裏側で自動生成し、購入者が後から演者を選んで
-- 確定するまでは非表示にする機能のスキーマ。
--
-- 「2階建て」設計: エントランスQR作成時、合計金額（1階＝通常のエントランス
-- 料金）はそのまま据え置き、その中から一部（2階＝ウェルカムチア分）を
-- welcome_cheer_amount として明示的に切り出す。2階に指定できるチア商品は
-- ワンプライス（min_amount=max_amount）かつ金額がwelcome_cheer_amountと
-- 完全一致するものだけに限定する（アプリ側でバリデーション）。

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS welcome_cheer_amount INTEGER,
  ADD COLUMN IF NOT EXISTS welcome_cheer_default_product_id UUID REFERENCES public.products(product_id);

COMMENT ON COLUMN public.products.welcome_cheer_amount IS
  'entranceタイプのみ使用。1人あたりの合計金額のうち、ウェルカムチア（2階）に割り当てる金額。NULLならこの機能は無効。';
COMMENT ON COLUMN public.products.welcome_cheer_default_product_id IS
  '確定前のデフォルト受取先（通常は主催者のワンプライスチア商品）。紐づく商品はmin_amount=max_amount=welcome_cheer_amountのワンプライス限定（アプリ側で検証）。';

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS welcome_cheer_locked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.transactions.welcome_cheer_locked_at IS
  'ウェルカムチア（2階）transactionで、購入者が演者を確定した日時。非NULLになったら以降は宛先変更不可。';
