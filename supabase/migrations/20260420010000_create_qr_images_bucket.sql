-- qr-images バケット作成（public）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qr-images',
  'qr-images',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 認証済みユーザーはアップロード可
CREATE POLICY "qr_images_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'qr-images');

-- 全員読み取り可（public bucket）
CREATE POLICY "qr_images_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'qr-images');

-- アップロード者本人は更新・削除可
CREATE POLICY "qr_images_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'qr-images');

CREATE POLICY "qr_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'qr-images');
