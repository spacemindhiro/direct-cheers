-- ==========================================
-- Project: Direct Cheers (Enterprise Grade)
-- Version: v2.13 (Retention, Roles & Compliance)
-- ==========================================

-- 1. 更新日時自動記録関数
create or replace function update_modified_column()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language 'plpgsql';

-- 2. イベント猶予期間（72時間）自動計算関数
create or replace function calculate_event_deadline()
returns trigger as $$ begin new.settlement_deadline = new.end_at + interval '72 hours'; return new; end; $$ language 'plpgsql';

-- 3. プロフィール（5大ロール・画像・Stripe連携）
create table public.profiles (
  profile_id uuid references auth.users on delete cascade primary key,
  -- Role: admin, sales, organizer, artist, user
  role text check (role in ('admin', 'sales', 'organizer', 'artist', 'user')) not null default 'artist',
  display_name text not null,
  avatar_url text, -- DJアイコン or 運営ロゴ
  stripe_connect_id text unique,
  base_fee_rate numeric(8,6) default 0.100000 not null, 
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 4. コネクション（主催者とアーティストの紐付け）
create table public.connections (
  connection_id uuid default gen_random_uuid() primary key,
  organizer_profile_id uuid references public.profiles(profile_id) not null,
  dj_profile_id uuid references public.profiles(profile_id) not null,
  status text check (status in ('pending', 'active', 'blocked')) default 'pending' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(organizer_profile_id, dj_profile_id)
);

-- 5. イベント（ガバナンス・画像・猶予期間）
create table public.events (
  event_id uuid default gen_random_uuid() primary key,
  organizer_profile_id uuid references public.profiles(profile_id) not null,
  title text not null,
  event_image_url text, -- 決済画面に出すメイン画像
  start_at timestamptz not null,
  end_at timestamptz not null,
  settlement_deadline timestamptz,
  allows_personal_qr boolean default false not null, -- 個人QR許可フラグ
  is_fee_overridden boolean default false not null,
  event_fee_rate numeric(8,6),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 6. QR設定（動的URL生成用・ラベル管理）
create table public.qr_configs (
  qr_config_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete cascade not null,
  creator_profile_id uuid references public.profiles(profile_id) not null,
  label text, -- 「メインブース用」等の管理ラベル
  is_personal boolean default false not null,
  logic_version int default 1 not null,
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

-- 8. トランザクション（決済事実・リテンション・法務同意）
create table public.transactions (
  transaction_id uuid default gen_random_uuid() primary key,
  stripe_payment_intent_id text unique not null,
  qr_config_id uuid references public.qr_configs(qr_config_id),
  
  -- Apple Pay等から自動取得した名寄せ用メアド
  payer_email text, 
  -- 会員登録後の紐付け先
  sender_profile_id uuid references public.profiles(profile_id),
  -- 特電法対応：マーケティング同意フラグ
  is_marketing_consented boolean default false not null,
  
  stripe_customer_id text,
  total_gross_amount numeric(12,2) not null,
  stripe_fee_amount numeric(12,2) not null,
  net_platform_amount numeric(12,2) not null,
  status text check (status in ('succeeded', 'refunded', 'disputed')) default 'succeeded' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 9. 配分明細（1円の狂いもない送金実績・インボイス証跡）
create table public.transaction_distributions (
  transaction_distribution_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) on delete cascade not null,
  profile_id uuid references public.profiles(profile_id) not null,
  actual_amount numeric(12,2) not null,
  taxable_amount numeric(12,2) not null,
  tax_amount numeric(12,2) not null,
  stripe_transfer_id text unique,
  is_platform_revenue boolean default false not null,
  created_at timestamptz default now() not null
);

-- インデックス
create index idx_trx_email_lookup on public.transactions(payer_email);
create index idx_trx_sender_profile on public.transactions(sender_profile_id);
create index idx_dist_profile_lookup on public.transaction_distributions(profile_id);

-- トリガー設定
create trigger update_profiles_modtime before update on public.profiles for each row execute function update_modified_column();
create trigger update_events_modtime before update on public.events for each row execute function update_modified_column();
create trigger set_event_deadline before insert or update of end_at on public.events for each row execute function calculate_event_deadline();