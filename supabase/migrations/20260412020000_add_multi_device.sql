-- ==========================================
-- パスキー複数デバイス対応
-- ==========================================

-- device_name カラムを追加（「俺のiPhone」「仕事用PC」など）
ALTER TABLE public.passkey_credentials
  ADD COLUMN device_name text;

-- ==========================================
-- アカウント統合トークン
-- メインアカウントから別メールの所有権を証明するための一時トークン
-- ==========================================
CREATE TABLE public.account_merge_tokens (
  token_id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token                text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  requester_profile_id uuid NOT NULL REFERENCES public.profiles(profile_id) ON DELETE CASCADE,
  target_email         text NOT NULL,
  expires_at           timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  used_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_merge_tokens ENABLE ROW LEVEL SECURITY;
-- サービスロールのみ操作（RLSポリシーなし）

-- ==========================================
-- デバイストークン（localStorage フィンガープリント）
-- 決済完了時に発行。「おかえりなさい」検知に使用
-- ==========================================
CREATE TABLE public.device_tokens (
  token_id       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token          text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  provisional_id uuid REFERENCES public.provisional_users(provisional_id) ON DELETE CASCADE,
  profile_id     uuid REFERENCES public.profiles(profile_id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
-- サービスロールのみ操作
