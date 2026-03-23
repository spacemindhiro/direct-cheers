-- ==========================================
-- Project: Direct Cheers (Enterprise Grade)
-- Version: v3.6.1 (Wallet Integration & JPY Master)
-- ==========================================

-- 1. 共通関数（自動更新・期限計算）
create or replace function update_modified_column()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language 'plpgsql';

-- 2. プロフィール (Wallet Address追加)
create table public.profiles (
  profile_id uuid references auth.users on delete cascade primary key,
  role text check (role in ('admin', 'agent', 'organizer', 'artist', 'user')) not null default 'artist',
  display_name text not null,
  avatar_url text,
  stripe_connect_id text unique,
  stripe_customer_id text,
  wallet_address text unique, -- 🦊 Web3ウォレット連携用
  verification_status text check (verification_status in ('unverified', 'pending', 'verified', 'rejected')) default 'unverified' not null,
  responsible_agent_id uuid references public.profiles(profile_id) on delete set null,
  base_fee_rate numeric(8,6) default 0.100000 not null, 
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 3. コネクション (信頼関係)
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

-- 4. イベント
create table public.events (
  event_id uuid default gen_random_uuid() primary key,
  organizer_profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  agent_id uuid references public.profiles(profile_id) on delete restrict not null,
  lifecycle_status text check (lifecycle_status in ('draft', 'published', 'ongoing', 'ended', 'settled')) default 'draft' not null,
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

-- 9. 商品マスター
create table public.products (
  product_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete restrict not null,
  artist_id uuid references public.profiles(profile_id) on delete restrict not null,
  name text not null,
  min_amount bigint not null default 500,
  digital_asset_url text, -- Wallet表示用の画像基盤
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 10. トランザクション (所有権情報を強化)
create table public.transactions (
  transaction_id uuid default gen_random_uuid() primary key,
  stripe_payment_intent_id text unique not null,
  product_id uuid references public.products(product_id) on delete restrict,
  qr_config_id uuid references public.qr_configs(qr_config_id) on delete restrict,
  sender_profile_id uuid references public.profiles(profile_id) on delete set null,
  sender_name text,
  sender_comment text,
  status text check (status in ('pending', 'succeeded', 'failed', 'refunded')) default 'pending' not null,
  total_gross_amount bigint not null,
  
  -- 🎫 Wallet / NFT 用ユニーク識別子
  nft_serial_number text unique, -- 決済成功時に生成: 例 DC-2026-0001
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
  actual_amount bigint not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 12. 販売証跡 (Wallet連携ステータス追加)
create table public.receipts (
  receipt_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) on delete restrict not null,
  item_name text not null,
  unit_price bigint not null,
  wallet_pass_url text, -- Apple/Google Walletパスへの直リンク
  issued_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 13. ペイアウトログ
create table public.payout_logs (
  payout_id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  amount bigint not null,
  status text check (status in ('scheduled', 'processing', 'completed', 'failed')) default 'scheduled' not null,
  stripe_transfer_id text unique,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 🛡️ トリガー設定 (全自動)
do $$
declare
    t text;
begin
    for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
    loop
        execute format('create trigger update_%I_modtime before update on public.%I for each row execute function update_modified_column()', t, t);
    end loop;
end $$;