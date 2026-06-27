-- ==========================================
-- passkey_credentials テーブル
-- ==========================================
create table public.passkey_credentials (
  credential_id         text primary key,
  profile_id            uuid references public.profiles(profile_id) on delete cascade not null,
  public_key            bytea not null,
  counter               bigint not null default 0,
  device_type           text,       -- 'singleDevice' | 'multiDevice'
  backed_up             boolean not null default false,
  transports            text[],
  created_at            timestamptz default now() not null,
  updated_at            timestamptz default now() not null
);

create trigger update_passkey_credentials_modtime
  before update on public.passkey_credentials
  for each row execute function update_modified_column();

alter table public.passkey_credentials enable row level security;

create policy "passkey_credentials_select" on public.passkey_credentials
  for select using (profile_id = auth.uid());

create policy "passkey_credentials_insert" on public.passkey_credentials
  for insert with check (profile_id = auth.uid());

create policy "passkey_credentials_delete" on public.passkey_credentials
  for delete using (profile_id = auth.uid());

-- ==========================================
-- passkey_challenges テーブル（チャレンジの一時保存）
-- ==========================================
create table public.passkey_challenges (
  challenge_id   uuid default gen_random_uuid() primary key,
  challenge      text not null unique,
  profile_id     uuid references public.profiles(profile_id) on delete cascade,
  purpose        text not null check (purpose in ('registration', 'authentication')),
  expires_at     timestamptz default now() + interval '5 minutes' not null,
  created_at     timestamptz default now() not null
);

-- 期限切れを自動削除（RLS は不要、サービスロールのみ操作）
alter table public.passkey_challenges enable row level security;

-- ==========================================
-- provisional_users テーブル
-- Stripe 決済後にメアドで仮登録するための一時テーブル
-- ==========================================
create table public.provisional_users (
  provisional_id    uuid default gen_random_uuid() primary key,
  email             text not null unique,
  stripe_customer_id text,
  profile_id        uuid references public.profiles(profile_id) on delete set null,
  converted_at      timestamptz,   -- 本登録完了時刻
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null
);

alter table public.provisional_users enable row level security;
-- RLS なし（サービスロールのみ）
