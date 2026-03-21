-- ==========================================
-- Project: 投げ銭決済プラットフォーム（金融グレード）
-- Version: v1.1 (Immutable Error Fix)
-- ==========================================

-- 1. 共通関数（更新日時・期限計算）
create or replace function update_modified_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language 'plpgsql';

create or replace function calculate_event_deadline()
returns trigger as $$
begin
    -- 終了時刻の259200秒（72時間）後を物理的に計算して格納
    new.settlement_deadline = new.end_at + interval '259200 seconds';
    return new;
end;
$$ language 'plpgsql';

-- 2. プロフィール
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  role text check (role in ('admin', 'organizer', 'dj')) not null default 'dj',
  display_name text not null,
  stripe_connect_id text unique,
  custom_fee_rate numeric(5,2) default 10.00,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

-- 3. コネクション（実績管理）
create table public.connections (
  id uuid default gen_random_uuid() primary key,
  organizer_id uuid references public.profiles(id) not null,
  dj_id uuid references public.profiles(id) not null,
  status text check (status in ('pending', 'active', 'blocked')) default 'pending',
  total_earned_amount numeric(12,2) default 0.00,
  event_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  unique(organizer_id, dj_id)
);

-- 4. イベント（修正版：生成カラムエラー回避のためトリガー方式に移行）
create table public.events (
  id uuid default gen_random_uuid() primary key,
  organizer_id uuid references public.profiles(id) not null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  -- 259200秒（72時間）を自動計算して格納する物理カラム
  settlement_deadline timestamptz,
  custom_fee_rate numeric(5,2),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz
);

-- 5. QR設定
create table public.qr_configs (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade,
  creator_id uuid references public.profiles(id) not null,
  ratio_data jsonb not null,
  logic_version int default 1,
  is_personal boolean default false,
  generated_at timestamptz default now(),
  last_logic_changed_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

-- 6. トランザクション（親：入金事実）
create table public.transactions (
  id uuid default gen_random_uuid() primary key,
  stripe_payment_intent_id text unique not null,
  qr_config_id uuid references public.qr_configs(id),
  total_amount numeric(12,2) not null,
  system_fee_amount numeric(12,2) not null,
  platform_fee_rate numeric(5,2) not null,
  status text check (status in ('succeeded', 'refunded', 'disputed')) default 'succeeded',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

-- 7. 配分明細（子：レジャー明細）
create table public.transaction_distributions (
  id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(id) on delete cascade not null,
  profile_id uuid references public.profiles(id) not null,
  amount numeric(12,2) not null,
  applied_ratio_snapshot numeric(5,2) not null,
  logic_version_snapshot int not null,
  distributed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

-- トリガー適用（自動計算および更新日時）
create trigger update_profiles_modtime before update on public.profiles for each row execute function update_modified_column();
create trigger update_connections_modtime before update on public.connections for each row execute function update_modified_column();
create trigger update_events_modtime before update on public.events for each row execute function update_modified_column();
create trigger update_qr_configs_modtime before update on public.qr_configs for each row execute function update_modified_column();
create trigger update_transactions_modtime before update on public.transactions for each row execute function update_modified_column();
create trigger update_transaction_distributions_modtime before update on public.transaction_distributions for each row execute function update_modified_column();

-- イベント終了後の猶予期間を自動計算するトリガー
create trigger set_event_deadline before insert or update of end_at on public.events for each row execute function calculate_event_deadline();