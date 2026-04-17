-- 20260417060000 の 2本目 ALTER TABLE が失敗して未作成だった列を補完
-- (ADD COLUMN IF NOT EXISTS なので再実行しても安全)

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
  ADD COLUMN IF NOT EXISTS business_name text;

-- business_type は NOT NULL DEFAULT があるため単独で追加
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_type text DEFAULT 'individual';

-- CHECK 制約（まだ存在しない場合のみ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_business_type_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_business_type_check
        CHECK (business_type IN ('individual', 'company'));
  END IF;
END $$;
