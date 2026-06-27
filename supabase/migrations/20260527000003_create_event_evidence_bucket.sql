-- event-evidence バケット作成（private）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-evidence',
  'event-evidence',
  false,
  20971520,  -- 20MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- service_role（admin client）のみアップロード可（RLS bypass）
-- アプリ側は常に admin client 経由でアクセスするためポリシー不要だが、
-- 管理者ユーザーが Dashboard から直接閲覧できるよう select だけ付与
CREATE POLICY "event_evidence_select_admin" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'event-evidence'
    AND (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) IN ('admin')
  );
