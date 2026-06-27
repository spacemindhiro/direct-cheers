-- qr_configs に product_id を追加（no.19対応）
-- QRコードと商品を1:1で紐づけ、決済ページで再選択させないようにする

ALTER TABLE public.qr_configs
  ADD COLUMN product_id uuid REFERENCES public.products(product_id) ON DELETE RESTRICT;
