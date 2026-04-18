-- エントランスタイプA・B の前売り販売期間（No.44対応）
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sales_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS sales_end_at   timestamptz;
