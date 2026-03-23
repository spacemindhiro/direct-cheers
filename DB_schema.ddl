-- ==========================================
-- Project: Direct Cheers (Full Audit & Risk Control)
-- Version: v3.9.0 (Verified Integrity & No Regressions)
-- ==========================================

-- 1. 共通関数
create or replace function update_modified_column()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language 'plpgsql';

-- 2. プロフィール (Wallet & Credit Status)
create table public.profiles (
  profile_id uuid references auth.users on delete cascade primary key,
  role text check (role in ('admin', 'agent', 'organizer', 'artist', 'user')) not null default 'user',
  display_name text not null,
  avatar_url text,
  stripe_connect_id text unique,
  stripe_customer_id text unique,
  wallet_address text unique,
  verification_status text check (verification_status in ('unverified', 'pending', 'verified', 'rejected')) default 'unverified' not null,
  responsible_agent_id uuid references public.profiles(profile_id), -- エージェント紐付け
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 3. イベント
create table public.events (
  event_id uuid default gen_random_uuid() primary key,
  organizer_profile_id uuid references public.profiles(profile_id) on delete restrict not null,
  title text not null,
  lifecycle_status text check (lifecycle_status in ('draft', 'published', 'ongoing', 'ended', 'settled')) default 'draft' not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  evidence_page_slug text unique,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 4. 分配設定 (ショッピング化対応)
create table public.distribution_configs (
  config_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) unique not null,
  platform_fee_rate numeric(8,6) default 0.100000 not null,
  agent_fee_rate    numeric(8,6) default 0.100000 not null,
  organizer_rate    numeric(8,6) default 0.400000 not null,
  artist_rate       numeric(8,6) default 0.400000 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 5. QR構成 (個人/共通)
create table public.qr_configs (
  qr_config_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) not null,
  creator_profile_id uuid references public.profiles(profile_id) not null,
  label text,
  is_personal boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

create table public.qr_config_targets (
  qr_config_target_id uuid default gen_random_uuid() primary key,
  qr_config_id uuid references public.qr_configs(qr_config_id) not null,
  profile_id uuid references public.profiles(profile_id) not null,
  distribution_ratio numeric(8,6) not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 6. 商品
create table public.products (
  product_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) not null,
  artist_id uuid references public.profiles(profile_id) not null,
  name text not null,
  min_amount bigint not null,
  digital_asset_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 7. トランザクション (決済 & 債務基盤)
create table public.transactions (
  transaction_id uuid default gen_random_uuid() primary key,
  stripe_payment_intent_id text unique not null,
  product_id uuid references public.products(product_id) not null,
  qr_config_id uuid references public.qr_configs(qr_config_id),
  sender_profile_id uuid references public.profiles(profile_id),
  status text check (status in ('pending', 'succeeded', 'failed', 'refunded')) default 'pending' not null,
  total_gross_amount bigint not null,
  nft_serial_number text unique, 
  stripe_funds_status text check (stripe_funds_status in ('held_in_platform', 'transferred', 'refunded')) default 'held_in_platform' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 8. デジタルアセット詳細 (Wallet用メタデータ)
create table public.digital_asset_metadata (
  metadata_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) unique not null,
  serial_number text not null,
  rarity_level text default 'common',
  hex_color text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 9. 精算サマリ (Go Trigger)
create table public.settlement_summaries (
  summary_id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(event_id) unique not null,
  total_accrued_amount bigint default 0 not null,
  is_approved_for_payout boolean default false not null,
  approved_at timestamptz,
  approved_by_profile_id uuid references public.profiles(profile_id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 10. 分配明細 (Accrual Ledger)
create table public.transaction_distributions (
  distribution_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) not null,
  event_id uuid references public.events(event_id) not null,
  profile_id uuid references public.profiles(profile_id) not null,
  distribution_role text check (distribution_role in ('platform', 'agent', 'organizer', 'artist')) not null,
  actual_amount bigint not null,
  distribution_status text check (distribution_status in ('accrued', 'scheduled', 'transferred', 'voided', 'reversed')) default 'accrued' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 11. 債権 & 出金リクエスト
create table public.debt_claims (
  claim_id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(profile_id) not null,
  original_transaction_id uuid references public.transactions(transaction_id),
  amount bigint not null,
  recovered_amount bigint default 0 not null,
  status text check (status in ('active', 'recovered', 'written_off')) default 'active' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

create table public.payout_requests (
  request_id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(profile_id) not null,
  requested_amount bigint not null,
  stripe_fee_deducted bigint not null,
  net_payout_amount bigint not null,
  status text check (status in ('pending', 'processing', 'completed', 'failed')) default 'pending' not null,
  stripe_transfer_id text unique,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- 12. 証跡
create table public.receipts (
  receipt_id uuid default gen_random_uuid() primary key,
  transaction_id uuid references public.transactions(transaction_id) not null,
  item_name text not null,
  wallet_pass_url text,
  issued_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- ==========================================
-- View: 出金可能額 (2Wホールド & 債権相殺)
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
      sum(amount - recovered_amount) as total_debt
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

-- トリガー適用
do $$
declare t text;
begin
    for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
    loop
        execute format('drop trigger if exists update_%I_modtime on public.%I', t, t);
        execute format('create trigger update_%I_modtime before update on public.%I for each row execute function update_modified_column()', t, t);
    end loop;
end $$;