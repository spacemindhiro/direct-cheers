-- QR画像の素材選択（宛先の画像／イベントのフライヤー／その場でアップロード）のための準備
--
-- 1. アバターの原本（切り抜き前・長辺1600px）
--    avatar_url 系は 1:1・400×400 に縮小して保存しており、QR画像（3:2・1200×800）に流用すると
--    最大 400×267 からの拡大になって粗くなる。QR画像に使うときは原本から切り抜く。
--    原本はアバターと必ず組で更新する（アバターだけ変わったら原本は null に戻す。/api/profile）。
--    既存ユーザーは null（=400px版から切り抜く。再登録すると原本が入る）。
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_original_url           text,
  ADD COLUMN IF NOT EXISTS artist_avatar_original_url    text,
  ADD COLUMN IF NOT EXISTS organizer_avatar_original_url text;

-- 2. イベントのフライヤー（events.base_flyer_url は初期スキーマから存在するが未使用だった）の置き場
--    アップロードは service role 経由（/api/events/flyer/upload）のみのため、storage.objects への
--    書き込みポリシーは作らない（avatars と同じ扱い）。
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
