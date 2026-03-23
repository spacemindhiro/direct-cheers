-- ==========================================
-- Project: Direct Cheers (Enterprise Grade)
-- Version: v3.5.9 (Verified JPY & Integer Master)
-- ==========================================

-- 1. 共通関数（タイムスタンプ自動更新・決済期限計算）
create or replace function update_modified_column()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language 'plpgsql';

create or replace function calculate_event_deadline()
returns trigger as $$ begin new.settlement_deadline = new.end_at + interval '72 hours'; return new; end; $$ language 'plpgsql';

-- 2. プロフィール
create table public.profiles (
  profile_id uuid references auth.users on delete cascade primary key,
  role text check (role in ('admin', 'agent', 'organizer', 'artist', 'user')) not null default 'artist',
  display_name text not null,
  avatar_url text,
  stripe_connect_id text unique,
  stripe_customer_id text,
  verification_status text check (verification_status in ('unverified', 'pending', 'verified', 'rejected')) default 'unverified' not null,
  responsible_agent_id uuid references public.profiles(profile_id) on delete set null,
  base_fee_rate numeric(8,6) default 0.100000 not null, 
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 3. コネクション（信頼関係）
create table public.connections (
  connection_id uuid default gen_random_uuid() primary key,
  organizer_profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  artist_profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  status text check (status in ('pending', 'active', 'blocked')) default 'pending' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  unique(organizer_profile_id, artist_profile_id)
);

-- 4. イベント (ステータス管理)
create table public.events (
  event_id uuid default gen_random_uuid() primary key,
  organizer_profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  agent_id uuid references public.profiles(profile_id) on delete restrict not null,
  lifecycle_status text check (lifecycle_status in ('draft', 'published', 'ongoing', 'ended', 'settled')) default 'draft' not null,
  is_satellite_connected boolean default false not null,
  evidence_page_slug text unique,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  settlement_deadline timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 5. イベント出演者
create table public.event_artists (
  event_artist_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete restrict not null,
  artist_profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  performance_order int,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  unique(event_id, artist_profile_id)
);

-- 6. 分配ルール
create table public.distribution_configs (
  config_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete restrict not null,
  platform_fee_rate numeric(8,6) default 0.100000 not null,
  agent_fee_rate    numeric(8,6) default 0.100000 not null,
  organizer_rate    numeric(8,6) default 0.400000 not null,
  artist_rate       numeric(8,6) default 0.400000 not null,
  nft_cost_bearer text check (nft_cost_bearer in ('platform', 'agent', 'organizer')) default 'platform',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz,
  unique(event_id)
);

-- 7. QR設定
create table public.qr_configs (
  qr_config_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete restrict not null,
  creator_profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  label text,
  is_personal boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 8. QR配分ターゲット
create table public.qr_config_targets (
  qr_config_target_id uuid default gen_random_uuid() primary key,
  qr_config_id uuid references public.qr_configs(qr_config_id) on delete restrict not null,
  profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  distribution_ratio numeric(8,6) not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 9. 商品マスター (NFT & 演出権)
create table public.products (
  product_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete restrict not null,
  artist_id uuid references public.profiles(profile_id) on delete restrict not null,
  name text not null default 'デジタル参加証明NFT & メッセージ掲載権',
  description text,
  price_type text check (price_type in ('fixed', 'flexible')) default 'flexible',
  min_amount bigint not null default 500, -- 1円単位の整数
  digital_asset_url text, 
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 10. トランザクション (最重要証跡)
create table public.transactions (
  transaction_id uuid default gen_random_uuid() primary key,
  stripe_payment_intent_id text unique not null,
  product_id uuid references public.products(product_id) on delete restrict,
  qr_config_id uuid references public.qr_configs(qr_config_id) on delete restrict,
  sender_profile_id uuid references public.profiles(profile_id) on delete set null,
  sender_name text,
  sender_comment text,
  status text check (status in ('pending', 'succeeded', 'failed', 'refunded')) default 'pending' not null,
  total_gross_amount bigint not null, -- 1円単位の整数
  is_nft_delivered boolean default false not null,
  mint_tx_hash text,
  sequence_number_in_event int4 default 1,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 11. 分配明細
create table public.transaction_distributions (
  transaction_distribution_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) on delete restrict not null,
  profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  distribution_role text check (distribution_role in ('platform', 'agent', 'organizer', 'artist')) not null,
  actual_amount bigint not null, -- 1円単位の整数
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 12. 販売証跡 (レシート)
create table public.receipts (
  receipt_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) on delete restrict not null,
  item_name text not null,
  unit_price bigint not null,
  nft_view_url text,
  message_log_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 13. ペイアウト（送金）ログ
create table public.payout_logs (
  payout_id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  amount bigint not null, -- 1円単位の整数
  status text check (status in ('scheduled', 'processing', 'completed', 'failed')) default 'scheduled' not null,
  stripe_transfer_id text unique,
  error_message text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- ==========================================
-- 🛡️ トリガー一括設定
-- ==========================================
do $$
declare
    t text;
begin
    for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
    loop
        execute format('create trigger update_%I_modtime before update on public.%I for each row execute function update_modified_column()', t, t);
    end loop;
end $$;

create trigger set_event_deadline before insert or update of end_at on public.events for each row execute function calculate_event_deadline();