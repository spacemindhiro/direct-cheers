-- ==========================================
-- Project: Direct Cheers (Financial & Risk Control)
-- Version: v4.3.0 (Dynamic Content & Dispute Armored)
-- ==========================================

-- 1. 共通関数（自動更新）
create or replace function update_modified_column()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language 'plpgsql';

-- 2. プロフィール (審査用URLの柔軟化 & ユニット対応)
create table public.profiles (
  profile_id uuid references auth.users on delete cascade primary key,
  role text check (role in ('admin', 'agent', 'organizer', 'artist', 'user')) not null default 'artist',
  display_name text not null,
  avatar_url text,
  -- 🔗 審査用: {"instagram": "...", "soundcloud": "...", "website": "..."}
  social_links jsonb default '{}'::jsonb, 
  stripe_connect_id text unique,
  stripe_customer_id text,
  wallet_address text unique,
  verification_status text check (verification_status in ('unverified', 'pending', 'verified', 'rejected')) default 'unverified' not null,
  responsible_agent_id uuid references public.profiles(profile_id) on delete set null,
  base_fee_rate numeric(8,6) default 0.100000 not null, 
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 3. コネクション
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

-- 4. イベント (フライヤー画像ベース管理)
create table public.events (
  event_id uuid default gen_random_uuid() primary key,
  organizer_profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  agent_id uuid references public.profiles(profile_id) on delete restrict not null,
  lifecycle_status text check (lifecycle_status in ('draft', 'published', 'ongoing', 'ended', 'settled')) default 'draft' not null,
  evidence_page_slug text unique,
  title text not null,
  base_flyer_url text, -- 🖼️ パーティの公式フライヤー（コンテンツのベース）
  start_at timestamptz not null,
  end_at timestamptz not null,
  settlement_deadline timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 5. イベント出演者 (時間管理 & 感謝メッセージ)
create table public.event_artists (
  event_artist_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete restrict not null,
  artist_profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  performance_order int,
  scheduled_start_at timestamptz,   -- 🕒 誰が今ステージにいるかの自動判定用
  slot_duration_minutes int,         -- 🕒 持ち時間
  thanks_message text,               -- 💬 完了画面に表示する一言
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
  digital_asset_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 10. トランザクション (動的コンテンツ属性の拡張)
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
  
  -- 🎨 動的印字用データ
  nft_serial_number text unique, -- DC-YYYY-XXXX
  sequence_number_in_event int4 default 1, -- 累計回数
  cumulative_amount_at_tx bigint,          -- 累計金額
  display_grade text default 'normal',     -- グレード
  
  stripe_funds_status text check (stripe_funds_status in ('held_in_platform', 'transferred', 'refunded')) default 'held_in_platform' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 11. 精算サマリ
create table public.settlement_summaries (
  summary_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) on delete restrict not null unique,
  is_approved_for_payout boolean default false not null,
  approved_at timestamptz, 
  approved_by_profile_id uuid references public.profiles(profile_id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 12. 分配明細
create table public.transaction_distributions (
  transaction_distribution_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) on delete restrict not null,
  event_id uuid references public.events(event_id) on delete restrict not null, 
  profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  distribution_role text check (distribution_role in ('platform', 'agent', 'organizer', 'artist')) not null,
  actual_amount bigint not null,
  distribution_status text check (distribution_status in ('accrued', 'scheduled', 'transferred', 'voided', 'reversed')) default 'accrued' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 13. 債権管理 (不審請求手数料の分離)
create table public.debt_claims (
  claim_id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  original_transaction_id uuid references public.transactions(transaction_id),
  claim_amount bigint not null,           -- アーティストから回収する額（元本）
  stripe_dispute_fee bigint default 0,    -- Stripe手数料（プラットフォーム実損分）
  recovered_amount bigint default 0 not null,
  status text check (status in ('active', 'recovered', 'written_off')) default 'active' not null,
  description text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 14. 出金リクエスト
create table public.payout_requests (
  request_id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  requested_amount bigint not null,
  stripe_fee_deducted bigint not null, 
  net_payout_amount bigint not null,   
  status text check (status in ('pending', 'processing', 'completed', 'failed')) default 'pending' not null,
  stripe_transfer_id text unique,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 15. 販売証跡
create table public.receipts (
  receipt_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) on delete restrict not null,
  item_name text not null,
  unit_price bigint not null,
  wallet_pass_url text,
  issued_at timestamptz default now() not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 16. 閲覧ログ (エビデンス)
create table public.asset_access_logs (
  log_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) on delete restrict not null,
  ip_address text,
  user_agent text,
  accessed_at timestamptz default now() not null
);

-- ==========================================
-- Logic View: 精算可能額 (債権相殺)
-- ==========================================
create or replace view public.view_withdrawable_balances as
with accrued_confirmed as (
    select 
      td.profile_id,
      sum(td.actual_amount) as total_accrued
    from public.transaction_distributions td
    join public.settlement_summaries ss on td.event_id = ss.event_id
    where td.deleted_at is null 
      and ss.deleted_at is null
      and td.distribution_status = 'accrued' 
      and ss.is_approved_for_payout = true
      and ss.approved_at <= now() - interval '14 days'
    group by td.profile_id
),
active_debts as (
    select 
      profile_id,
      sum(claim_amount - recovered_amount) as total_debt
    from public.debt_claims
    where deleted_at is null and status = 'active'
    group by profile_id
)
select 
  p.profile_id,
  p.display_name,
  coalesce(a.total_accrued, 0) as raw_withdrawable,
  coalesce(d.total_debt, 0) as active_debt,
  greatest(0, coalesce(a.total_accrued, 0) - coalesce(d.total_debt, 0)) as final_withdrawable_amount
from public.profiles p
left join accrued_confirmed a on p.profile_id = a.profile_id
left join active_debts d on p.profile_id = d.profile_id
where p.deleted_at is null;

-- 🛡️ トリガー設定 (全自動)
do $$
declare t text;
begin
    for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
    loop
        execute format('drop trigger if exists update_%I_modtime on public.%I', t, t);
        execute format('create trigger update_%I_modtime before update on public.%I for each row execute function update_modified_column()', t, t);
    end loop;
end $$;