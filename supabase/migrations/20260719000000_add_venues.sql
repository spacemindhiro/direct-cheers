-- ==========================================
-- 会場マスタ（venues）
--
-- 背景:
-- タッチ決済(Case④)のStripe Terminal接続には物理会場ごとのLocationが必要だが、
-- これまで環境変数STRIPE_TERMINAL_LOCATION_IDの単一固定値しか無く、会場が変わる
-- たびに手動でLocationを作り直す運用になっていた。
--
-- 設計:
-- - venuesは組織横断で共有するマスタ（同じハコに主催者ごとの別設定を作らない）。
--   created_byは最初に登録した人の記録のみで、検索・権限のスコープには使わない。
-- - 住所は必須項目とするが、値の精度は問わない（郵便番号・番地とも最寄りでよい）。
--   Stripe Terminal Location(日本)は公式には郵便番号等が必須と案内されているが、
--   β版のため実際のAPIバリデーションはより緩い（2026-07-19に実APIで確認済み）。
--   将来の仕様厳格化に備え、こちら側のフォームでは常に必須で埋めさせる。
-- - stripe_terminal_location_idは遅延作成（初回のタッチ決済接続時に作成しキャッシュ）。
--   会場登録という単純なDB操作にStripe API障害のリスクを持ち込まないため。
-- ==========================================

create table public.venues (
  venue_id                  uuid primary key default gen_random_uuid(),
  created_by                uuid not null references public.profiles(profile_id) on delete restrict,
  name                      text not null,
  postal_code               text not null,
  prefecture                text not null,
  city                      text not null,
  town                      text,
  line1                     text not null,
  stripe_terminal_location_id text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  deleted_at                timestamptz
);

-- 論理削除後の名前再利用を許すため、有効行のみUNIQUE（組織横断でグローバルに一意）
create unique index venues_name_key
  on public.venues (name) where deleted_at is null;

create trigger update_venues_modtime
  before update on public.venues
  for each row execute function update_modified_column();

alter table public.events
  add column if not exists venue_id uuid references public.venues(venue_id) on delete set null;

-- ==========================================
-- RLS（equipment_devicesと同じロール方針）
-- ==========================================
alter table public.venues enable row level security;

create policy "venues_select" on public.venues
  for select using (
    (select role from public.profiles where profile_id = auth.uid()) in ('organizer','agent','admin')
  );
create policy "venues_insert" on public.venues
  for insert with check (
    (select role from public.profiles where profile_id = auth.uid()) in ('organizer','agent','admin')
  );
create policy "venues_update" on public.venues
  for update using (
    (select role from public.profiles where profile_id = auth.uid()) in ('organizer','agent','admin')
  );
