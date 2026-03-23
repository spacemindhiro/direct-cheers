-- ==========================================
-- Project: Direct Cheers (Enterprise Grade)
-- Version: v3.5.1 (Commerce, NFT & Multi-Payment Integration)
-- ==========================================

-- 1. 共通関数（自動更新・猶予期間計算）
create or replace function update_modified_column()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language 'plpgsql';

create or replace function calculate_event_deadline()
returns trigger as $$ begin new.settlement_deadline = new.end_at + interval '72 hours'; return new; end; $$ language 'plpgsql';

-- 2. プロフィール（Agent管理・審査ステータス・Stripe連携）
create table public.profiles (
  profile_id uuid references auth.users on delete cascade primary key,
  -- Role: admin, agent, organizer, artist, user
  role text check (role in ('admin', 'agent', 'organizer', 'artist', 'user')) not null default 'artist',
  display_name text not null,
  avatar_url text,
  bio text,
  stripe_connect_id text unique,
  stripe_customer_id text, -- 購入者としてのカード保存用
  
  -- 🕵️‍♂️ 審査ステータス（Agentによる実態確認）
  verification_status text check (verification_status in ('unverified', 'pending', 'verified', 'rejected')) default 'unverified' not null,
  responsible_agent_id uuid references public.profiles(profile_id),
  
  base_fee_rate numeric(8,6) default 0.100000 not null, 
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 3. イベント（興行実態・Starlink・エビデンス）
create table public.events (
  event_id uuid default gen_random_uuid() primary key,
  organizer_profile_id uuid references public.profiles(profile_id) not null,
  agent_id uuid references public.profiles(profile_id) not null,
  created_by_role text check (created_by_role in ('agent', 'self')) not null default 'agent',
  
  -- 📡 現場インフラ・審査用
  is_satellite_connected boolean default false not null,
  evidence_page_slug text unique, -- Stripe審査官に見せるURL
  flyer_image_url text,
  
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  settlement_deadline timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 4. 商品マスター（「投げ銭」を「商品」として定義）
create table public.products (
  product_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete cascade not null,
  artist_id uuid references public.profiles(profile_id) not null,
  
  -- 審査対策：商品名と説明を固定/推奨化
  name text not null default 'デジタル参加証明NFT & メッセージ掲載権',
  description text default 'アーティストへの応援メッセージ送信と、限定シリアル入りデジタルNFTの所有権が含まれます。',
  
  price_type text check (price_type in ('fixed', 'flexible')) default 'flexible',
  min_amount int4 default 500,
  digital_asset_url text, -- サンクスカード画像（NFTのメタデータ元）
  created_at timestamptz default now()
);

-- 5. トランザクション（販売証跡・NFT配送・複数決済対応）
create table public.transactions (
  transaction_id uuid default gen_random_uuid() primary key,
  stripe_payment_intent_id text unique not null,
  product_id uuid references public.products(product_id),
  
  -- 💎 顧客データ（名前・コメント）
  sender_name text,
  sender_comment text,
  sender_profile_id uuid references public.profiles(profile_id),
  
  -- 💰 決済・配送ステータス
  status text check (status in ('pending', 'succeeded', 'failed')) default 'pending' not null,
  is_nft_delivered boolean default false not null,
  mint_tx_hash text, -- ブロックチェーン上の配送（発送）証明
  
  -- 📈 ゲーミフィケーション：同一イベント内での購入回数
  sequence_number_in_event int4 default 1,
  
  -- ⚖️ 会計・代理受取管理
  total_gross_amount numeric(12,2) not null,
  payout_status text check (payout_status in ('stripe_sent', 'pending_cash', 'cash_completed')) default 'pending_cash' not null,
  
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 6. 配分明細（インボイス・利益分配）
create table public.transaction_distributions (
  transaction_distribution_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) on delete cascade not null,
  profile_id uuid references public.profiles(profile_id) not null,
  actual_amount numeric(12,2) not null,
  is_platform_revenue boolean default false not null,
  created_at timestamptz default now() not null
);

-- 7. 販売証跡・レシート（Stripe/税務調査への決定打）
create table public.receipts (
  receipt_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) not null,
  item_name text not null,
  unit_price numeric(12,2) not null,
  nft_view_url text, -- 商品（NFT）の確認用URL
  message_log_url text, -- 役務提供（メッセージ掲出）の証拠URL
  issued_at timestamptz default now()
);

-- ==========================================
-- 🛡️ インデックス & トリガー
-- ==========================================
create index idx_trx_sender_event on public.transactions(sender_profile_id, product_id);
create index idx_dist_profile_lookup on public.transaction_distributions(profile_id);
create index idx_event_slug on public.events(evidence_page_slug);

create trigger update_profiles_modtime before update on public.profiles for each row execute function update_modified_column();
create trigger update_events_modtime before update on public.events for each row execute function update_modified_column();
create trigger set_event_deadline before insert or update of end_at on public.events for each row execute function calculate_event_deadline();

-- ==========================================
-- 🛡️ RLS (Row Level Security)
-- ==========================================
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.transactions enable row level security;

create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = profile_id);