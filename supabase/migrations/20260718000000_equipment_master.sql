-- ==========================================
-- 機材マスタ（equipment_devices）とタブレットホルダー（booth_holders）
--
-- 背景:
-- 1. 子機のdevice_idが「端末名のハッシュ」で生成されており、名前を変えると
--    別端末として二重登録され、親機に新旧の名前が併記されていた。
-- 2. 端末名の保存先が子機のlocalStorageのみで、ストレージが消えると
--    名前がリセットされていた。
-- 3. NFCタグ⇔子機の紐付け（booth_devices）が端末名キーで、名前変更で
--    ペアリングが切れていた。また物理的にNFCタグは「タブレットホルダー」に
--    貼られているのに、ホルダーという実体がモデルに無かった。
--
-- 新設計:
-- - equipment_devices: イベント横断の機材マスタ。不変のdevice_id（サーバー発行）と
--   表示名（UNIQUE）を持つ。名前変更してもIDは不変。所有者を持つ（当面は全機材オーナー所有）。
-- - booth_holders: タブレットホルダーのマスタ。NFCタグはホルダーに貼る。
--   「NFCタグ → ホルダー → （今載っている）機材 → 表示すべきQR」の関係で制御する。
-- - 既存booth_devicesは移行後、旧クライアント（PWAキャッシュ）互換のため当面残す。
-- ==========================================

create table public.equipment_devices (
  device_id        uuid primary key default gen_random_uuid(),
  display_name     text not null,
  owner_profile_id uuid not null references public.profiles(profile_id) on delete restrict,
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- 論理削除後の名前再利用を許すため、有効行のみUNIQUE
create unique index equipment_devices_display_name_key
  on public.equipment_devices (display_name) where deleted_at is null;

create trigger update_equipment_devices_modtime
  before update on public.equipment_devices
  for each row execute function update_modified_column();

create table public.booth_holders (
  holder_id            uuid primary key default gen_random_uuid(),
  name                 text not null,
  nfc_routing_id       text unique,
  current_device_id    uuid references public.equipment_devices(device_id) on delete set null,
  current_event_id     uuid references public.events(event_id) on delete set null,
  current_qr_config_id uuid references public.qr_configs(qr_config_id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create unique index booth_holders_name_key
  on public.booth_holders (name) where deleted_at is null;

create trigger update_booth_holders_modtime
  before update on public.booth_holders
  for each row execute function update_modified_column();

-- ==========================================
-- RLS（booth_devicesと同じロール方針。書き込みはAPI経由のadmin clientが主）
-- ==========================================
alter table public.equipment_devices enable row level security;
alter table public.booth_holders enable row level security;

create policy "equipment_devices_select" on public.equipment_devices
  for select using (
    (select role from public.profiles where profile_id = auth.uid()) in ('organizer','agent','admin')
  );
create policy "equipment_devices_insert" on public.equipment_devices
  for insert with check (
    (select role from public.profiles where profile_id = auth.uid()) in ('organizer','agent','admin')
  );
create policy "equipment_devices_update" on public.equipment_devices
  for update using (
    (select role from public.profiles where profile_id = auth.uid()) in ('organizer','agent','admin')
  );

create policy "booth_holders_select" on public.booth_holders
  for select using (
    (select role from public.profiles where profile_id = auth.uid()) in ('organizer','agent','admin')
  );
create policy "booth_holders_insert" on public.booth_holders
  for insert with check (
    (select role from public.profiles where profile_id = auth.uid()) in ('organizer','agent','admin')
  );
create policy "booth_holders_update" on public.booth_holders
  for update using (
    (select role from public.profiles where profile_id = auth.uid()) in ('organizer','agent','admin')
  );

-- ==========================================
-- 既存booth_devicesからのデータ移行
-- device_code（端末名）→ 機材マスタ1件＋同名ホルダー1件に分解する。
-- 所有者は最古のadmin（当面は全機材オーナー所有の方針）。
-- adminが存在しない環境（初期化直後のローカル等）ではbooth_devicesも空のため実行されない。
-- ==========================================
insert into public.equipment_devices (display_name, owner_profile_id)
select bd.device_code,
       (select profile_id from public.profiles where role = 'admin' order by created_at limit 1)
from public.booth_devices bd
where (select profile_id from public.profiles where role = 'admin' order by created_at limit 1) is not null
  and not exists (
    select 1 from public.equipment_devices ed
    where ed.display_name = bd.device_code and ed.deleted_at is null
  );

insert into public.booth_holders (name, nfc_routing_id, current_device_id, current_event_id, current_qr_config_id)
select bd.device_code,
       bd.nfc_routing_id,
       ed.device_id,
       bd.current_event_id,
       bd.current_qr_config_id
from public.booth_devices bd
left join public.equipment_devices ed
  on ed.display_name = bd.device_code and ed.deleted_at is null
where not exists (
  select 1 from public.booth_holders bh
  where bh.name = bd.device_code and bh.deleted_at is null
);
