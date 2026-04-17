-- profiles にロール別プロフィール項目・Stripe事前情報を追加（no.46対応）

-- アーティスト/オーガナイザー/エージェント向けプロフィール項目
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS affiliation text,
  ADD COLUMN IF NOT EXISTS credit_name text,
  ADD COLUMN IF NOT EXISTS genre text,
  ADD COLUMN IF NOT EXISTS organization_name text;

-- Stripe Connect 事前入力用（口座登録に必要な本人情報）
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS dob_year smallint,
  ADD COLUMN IF NOT EXISTS dob_month smallint,
  ADD COLUMN IF NOT EXISTS dob_day smallint,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS prefecture text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS street_address text,
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS business_name text;

ALTER TABLE public.profiles
  ADD CONSTRAINT IF NOT EXISTS profiles_business_type_check
    CHECK (business_type IN ('individual', 'company'));
