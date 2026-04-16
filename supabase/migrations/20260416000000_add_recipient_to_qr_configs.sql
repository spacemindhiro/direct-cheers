-- qr_configs に宛先（recipient_profile_id）を追加
-- 決済が誰宛てかを明示するための必須フィールド

ALTER TABLE public.qr_configs
  ADD COLUMN recipient_profile_id uuid REFERENCES public.profiles(profile_id) ON DELETE RESTRICT;

-- 既存レコードは creator_profile_id で埋める（移行用）
UPDATE public.qr_configs
  SET recipient_profile_id = creator_profile_id
  WHERE recipient_profile_id IS NULL;

-- NULL 禁止に変更
ALTER TABLE public.qr_configs
  ALTER COLUMN recipient_profile_id SET NOT NULL;
