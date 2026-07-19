-- ウェルカムチアのデフォルト受取先（主催者宛のワンプライスチアQR/商品を
-- QR作成時に内部的に自動生成したもの）を、通常のQR一覧・チアQR選択候補
-- から区別して除外するためのフラグ。
--
-- 背景: これまでこのフラグが無く、自動生成されたQRが通常のチアQRと
-- 同列にオーガナイザーのQR一覧に表示され、誤って削除できてしまう、
-- 他のエントランスQRのウェルカムチア候補選択にも紛れ込む、といった
-- 問題があった。

ALTER TABLE public.qr_configs
  ADD COLUMN IF NOT EXISTS is_welcome_cheer_default BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_welcome_cheer_default BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.qr_configs.is_welcome_cheer_default IS
  'ウェルカムチアのデフォルト受取先として内部的に自動生成されたQRか。trueの場合、通常のQR一覧・候補選択からは除外し、誤削除も防ぐ。';
COMMENT ON COLUMN public.products.is_welcome_cheer_default IS
  'ウェルカムチアのデフォルト受取先として内部的に自動生成された商品か。qr_configs.is_welcome_cheer_defaultと同じ意味。';

-- バックフィル: このフラグ導入前に作成された、現在有効なデフォルト受取先
-- （products.welcome_cheer_default_product_idから参照されているもの）に
-- 遡ってフラグを立てる。
UPDATE public.products
SET is_welcome_cheer_default = TRUE
WHERE product_id IN (
  SELECT welcome_cheer_default_product_id
  FROM public.products
  WHERE welcome_cheer_default_product_id IS NOT NULL
);

UPDATE public.qr_configs
SET is_welcome_cheer_default = TRUE
WHERE product_id IN (
  SELECT welcome_cheer_default_product_id
  FROM public.products
  WHERE welcome_cheer_default_product_id IS NOT NULL
);
