-- qr-images の上書き・削除をアップロードした本人に限る（hotfix 2026-10-12）
--
-- 20260420010000_create_qr_images_bucket.sql の UPDATE/DELETE ポリシーは、コメントでは
-- 「アップロード者本人は更新・削除可」としながら bucket_id しか見ていなかった。
-- そのためログイン済みなら誰でも、ブラウザから Storage API を直接叩いて他人のQR画像
-- （/c ページ・チアカード・Wallet の画像）を上書き・削除できた。
--
-- アプリは毎回新しいパス（`${prefix}/${Date.now()}.jpg`）に保存し、削除もしないため、
-- 本人以外の更新・削除が必要な場面は無い。owner_id は Storage がアップロード時に
-- JWT の sub（= auth.uid()）を自動で入れる。

DROP POLICY IF EXISTS "qr_images_update" ON storage.objects;
CREATE POLICY "qr_images_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'qr-images' AND owner_id = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'qr-images' AND owner_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "qr_images_delete" ON storage.objects;
CREATE POLICY "qr_images_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'qr-images' AND owner_id = (SELECT auth.uid())::text);
