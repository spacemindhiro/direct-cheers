-- ==========================================
-- Add pending_terms to profiles.status
-- ==========================================
alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
    check (status in ('pending_onboarding', 'pending_terms', 'pending_interview', 'active', 'rejected'));

-- ==========================================
-- terms_agreements テーブル
-- ==========================================
create table public.terms_agreements (
  agreement_id          uuid default gen_random_uuid() primary key,
  profile_id            uuid references public.profiles(profile_id) on delete restrict not null,
  agreed_roles          text[] not null,          -- ['artist'], ['artist','organizer'], etc.
  signature_storage_path text not null,           -- supabase storage path
  ip_address            text,
  user_agent            text,
  agreed_at             timestamptz default now() not null,
  created_at            timestamptz default now() not null,
  updated_at            timestamptz default now() not null
);

create trigger update_terms_agreements_modtime
  before update on public.terms_agreements
  for each row execute function update_modified_column();

alter table public.terms_agreements enable row level security;

-- SELECT: 自分の同意のみ or admin
create policy "terms_agreements_select" on public.terms_agreements
  for select using (
    profile_id = auth.uid()
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- INSERT: 自分のプロファイルにのみ
create policy "terms_agreements_insert" on public.terms_agreements
  for insert with check (
    profile_id = auth.uid()
  );

-- ==========================================
-- Supabase Storage: signatures バケット
-- (SQL では bucket 作成できないため注意書き)
-- → Supabase Dashboard > Storage > New bucket
--   name: "signatures", public: false
-- ==========================================
