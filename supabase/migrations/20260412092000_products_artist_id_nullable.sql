-- products.artist_id を nullable に変更
-- 配分先が複数（オーガナイザー＋アーティスト混在）の場合に対応
ALTER TABLE public.products
  ALTER COLUMN artist_id DROP NOT NULL;
