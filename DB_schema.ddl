-- ==========================================
-- Project: Direct Cheers (Financial Grade)
-- Version: v1.7 (Normalized / High Precision)
-- Description: master_schema.sql
-- ==========================================

-- 1. 共通更新関数
create or replace function update_modified_column() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language 'plpgsql';

-- 2. イベント猶予期間計算関数
create or replace function calculate_event_deadline() returns trigger as $$
begin new.settlement_deadline = new.end_at + interval '259200 seconds'; return new; end; $$ language 'plpgsql';

-- 3. プロフィール (0.100000 = 10%)
create table public.profiles (
  profile_id uuid references auth.users on delete cascade primary key,
  role text check (role in ('admin', 'organizer', 'dj')) not null default 'dj',
  display_name text not null,
  stripe_connect_id text unique,
  base_fee_rate numeric(8,6) default 0.100000 not null, 
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 4. コネクション (集計項目を排除)
create table public.connections (
  connection_id uuid default gen_random_uuid() primary key,
  organizer_profile_id uuid references public.profiles(profile_id) not null,
  dj_profile_id uuid references public.profiles(profile_id) not null,
  -- 申請・承認・ブロックの状態管理
  status text check (status in ('pending', 'active', 'blocked')) default 'pending' not null,
  event_count int default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(organizer_profile_id, dj_profile_id)
);

-- 5. イベント
create table public.events (
  event_id uuid default gen_random_uuid() primary key,
  organizer_profile_id uuid references public.profiles(profile_id) not null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  settlement_deadline timestamptz,
  is_fee_overridden boolean default false not null,
  event_fee_rate numeric(8,6),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 6. QR設定
create table public.qr_configs (
  qr_config_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete cascade not null,
  creator_profile_id uuid references public.profiles(profile_id) not null,
  logic_version int default 1 not null,
  is_personal boolean default false not null,
  last_logic_changed_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 7. QR配分ターゲット
create table public.qr_config_targets (
  qr_config_target_id uuid default gen_random_uuid() primary key,
  qr_config_id uuid references public.qr_configs(qr_config_id) on delete cascade not null,
  profile_id uuid references public.profiles(profile_id) not null,
  distribution_ratio numeric(8,6) not null,
  check (distribution_ratio >= 0 and distribution_ratio <= 1)
);

-- 8. トランザクション (親)
create table public.transactions (
  transaction_id uuid default gen_random_uuid() primary key,
  stripe_payment_intent_id text unique not null,
  qr_config_id uuid references public.qr_configs(qr_config_id),
  total_amount numeric(12,2) not null,
  system_fee_amount numeric(12,2) not null,
  platform_fee_rate numeric(8,6) not null,
  status text check (status in ('succeeded', 'refunded', 'disputed')) default 'succeeded' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 9. 配分明細 (子：Snapshot Ledger)
create table public.transaction_distributions (
  transaction_distribution_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) on delete cascade not null,
  profile_id uuid references public.profiles(profile_id) not null,
  amount numeric(12,2) not null,
  applied_ratio_snapshot numeric(8,6) not null,
  logic_version_snapshot int not null,
  distributed_at timestamptz default now() not null,
  created_at timestamptz default now() not null
);

-- 集計用インデックス（性能対策）
create index idx_dist_profile_amount on public.transaction_distributions(profile_id, amount);

-- 10. トリガー適用
create trigger update_profiles_modtime before update on public.profiles for each row execute function update_modified_column();
create trigger update_connections_modtime before update on public.connections for each row execute function update_modified_column();
create trigger update_events_modtime before update on public.events for each row execute function update_modified_column();
create trigger update_qr_configs_modtime before update on public.qr_configs for each row execute function update_modified_column();
create trigger update_transactions_modtime before update on public.transactions for each row execute function update_modified_column();
create trigger set_event_deadline before insert or update of end_at on public.events for each row execute function calculate_event_deadline();

-- 11. Auth連携 (Profile自動生成)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (profile_id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email), 'dj');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();