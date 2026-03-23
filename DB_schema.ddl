-- ==========================================
-- Project: Direct Cheers (Enterprise Grade)
-- Version: v3.5.5 (Fully Verified & Complete)
-- ==========================================

-- 1. 共通関数
create or replace function update_modified_column()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language 'plpgsql';

create or replace function calculate_event_deadline()
returns trigger as $$ begin new.settlement_deadline = new.end_at + interval '72 hours'; return new; end; $$ language 'plpgsql';

-- 2. プロフィール (ユーザー/Agent/Artist/Org)
create table public.profiles (
  profile_id uuid references auth.users on delete cascade primary key,
  role text check (role in ('admin', 'agent', 'organizer', 'artist', 'user')) not null default 'artist',
  display_name text not null,
  avatar_url text,
  bio text,
  stripe_connect_id text unique,
  stripe_customer_id text,
  verification_status text check (verification_status in ('unverified', 'pending', 'verified', 'rejected')) default 'unverified' not null,
  responsible_agent_id uuid references public.profiles(profile_id),
  base_fee_rate numeric(8,6) default 0.100000 not null, 
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 3. コネクション (マスタ同士の信頼関係)
create table public.connections (
  connection_id uuid default gen_random_uuid() primary key,
  organizer_profile_id uuid references public.profiles(profile_id) not null,
  artist_profile_id uuid references public.profiles(profile_id) not null,
  status text check (status in ('pending', 'active', 'blocked')) default 'pending' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(organizer_profile_id, artist_profile_id)
);

-- 4. イベント (興行実態)
create table public.events (
  event_id uuid default gen_random_uuid() primary key,
  organizer_profile_id uuid references public.profiles(profile_id) not null,
  agent_id uuid references public.profiles(profile_id) not null,
  created_by_role text check (created_by_role in ('agent', 'self')) not null default 'agent',
  is_satellite_connected boolean default false not null,
  evidence_page_slug text unique,
  flyer_image_url text,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  settlement_deadline timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 5. イベント出演者 (特定のイベントへのアサイン) ★追加
create table public.event_artists (
  event_artist_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete cascade not null,
  artist_profile_id uuid references public.profiles(profile_id) not null,
  performance_order int, -- 出演順
  created_at timestamptz default now() not null,
  unique(event_id, artist_profile_id)
);

-- 6. 分配ルール (マスター設定)
create table public.distribution_configs (
  config_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete cascade not null,
  platform_fee_rate numeric(8,6) default 0.100000 not null,
  agent_fee_rate    numeric(8,6) default 0.100000 not null,
  organizer_rate    numeric(8,6) default 0.400000 not null,
  artist_rate       numeric(8,6) default 0.400000 not null,
  nft_cost_bearer text check (nft_cost_bearer in ('platform', 'agent', 'organizer')) default 'platform',
  created_at timestamptz default now() not null,
  unique(event_id)
);

-- 7. QR設定 (物理的な入り口)
create table public.qr_configs (
  qr_config_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete cascade not null,
  creator_profile_id uuid references public.profiles(profile_id) not null,
  label text,
  is_personal boolean default false not null,
  logic_version int default 1 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 8. QR配分ターゲット (決済ごとの分配先)
create table public.qr_config_targets (
  qr_config_target_id uuid default gen_random_uuid() primary key,
  qr_config_id uuid references public.qr_configs(qr_config_id) on delete cascade not null,
  profile_id uuid references public.profiles(profile_id) not null,
  distribution_ratio numeric(8,6) not null,
  check (distribution_ratio >= 0 and distribution_ratio <= 1)
);

-- 9. 商品マスター (NFT & 演出権)
create table public.products (
  product_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete cascade not null,
  artist_id uuid references public.profiles(profile_id) not null,
  name text not null default 'デジタル参加証明NFT & メッセージ掲載権',
  description text,
  price_type text check (price_type in ('fixed', 'flexible')) default 'flexible',
  min_amount int4 default 500,
  digital_asset_url text, 
  created_at timestamptz default now()
);

-- 10. トランザクション
create table public.transactions (
  transaction_id uuid default gen_random_uuid() primary key,
  stripe_payment_intent_id text unique not null,
  product_id uuid references public.products(product_id),
  qr_config_id uuid references public.qr_configs(qr_config_id),
  sender_name text,
  sender_comment text,
  sender_profile_id uuid references public.profiles(profile_id),
  status text check (status in ('pending', 'succeeded', 'failed')) default 'pending' not null,
  is_nft_delivered boolean default false not null,
  mint_tx_hash text,
  sequence_number_in_event int4 default 1,
  total_gross_amount numeric(12,2) not null,
  payout_status text check (payout_status in ('stripe_sent', 'pending_cash', 'cash_completed')) default 'pending_cash' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 11. 分配明細 (計算済みデータ)
create table public.transaction_distributions (
  transaction_distribution_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) on delete cascade not null,
  profile_id uuid references public.profiles(profile_id) not null,
  distribution_role text check (distribution_role in ('platform', 'agent', 'organizer', 'artist')) not null,
  actual_amount numeric(12,2) not null,
  is_platform_revenue boolean default false not null,
  created_at timestamptz default now() not null
);

-- 12. 販売証跡 (審査用)
create table public.receipts (
  receipt_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) not null,
  item_name text not null,
  unit_price numeric(12,2) not null,
  nft_view_url text,
  message_log_url text,
  issued_at timestamptz default now()
);

-- 13. ペイアウト（送金）ログ ★追加
create table public.payout_logs (
  payout_id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(profile_id) not null,
  amount numeric(12,2) not null,
  status text check (status in ('scheduled', 'processing', 'completed', 'failed')) default 'scheduled' not null,
  stripe_transfer_id text unique,
  error_message text,
  created_at timestamptz default now() not null
);

-- 14. インデックス & トリガー
create index idx_event_art_event on public.event_artists(event_id);
create index idx_trx_product on public.transactions(product_id);
create trigger update_profiles_modtime before update on public.profiles for each row execute function update_modified_column();
create trigger update_connections_modtime before update on public.connections for each row execute function update_modified_column();
create trigger update_events_modtime before update on public.events for each row execute function update_modified_column();
create trigger update_qr_modtime before update on public.qr_configs for each row execute function update_modified_column();
create trigger set_event_deadline before insert or update of end_at on public.events for each row execute function calculate_event_deadline();