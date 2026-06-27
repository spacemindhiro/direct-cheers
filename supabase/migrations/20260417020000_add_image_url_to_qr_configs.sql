-- qr_configs に QR画像URLを追加（no.57対応）
ALTER TABLE public.qr_configs ADD COLUMN image_url text;

-- ※ Supabase Dashboard で "qr-images" バケット（public）を作成してください
-- Storage > New bucket > Name: qr-images, Public: ON
