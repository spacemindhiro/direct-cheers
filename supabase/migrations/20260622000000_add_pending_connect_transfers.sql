-- ============================================================
-- pending_connect_transfers: settle時にStripe Connectアカウントが
-- 未オンボーディングのためTransferできなかった分配をプールするテーブル
--
-- 背景: settle時、配分先（organizer/artist/agent）のConnectアカウントが
-- 未オンボーディング（connect_id無し、または charges_enabled/payouts_enabled
-- がfalse）だとTransferがサイレントスキップまたはエラーで握り潰され、
-- transaction_distributions は 'accrued' のまま永久に滞留していた。
-- このテーブルに記録し、オンボーディング完了時に自動リトライする。
-- ============================================================

create table public.pending_connect_transfers (
  pending_transfer_id uuid        primary key default gen_random_uuid(),
  event_id             uuid        not null references public.events(event_id) on delete cascade,
  profile_id           uuid        not null references public.profiles(profile_id) on delete cascade,
  tx_id                uuid        references public.transactions(transaction_id) on delete set null,
  role                 text        not null,                  -- organizer / artist / agent
  amount               bigint      not null check (amount > 0),
  charge_id            text,                                   -- source_transaction用。nullなら旧platform-balanceフロー
  status               text        not null default 'pending', -- pending / transferred / failed
  last_error           text,
  stripe_transfer_id   text,
  attempt_count        integer     not null default 0,
  created_at           timestamptz not null default now(),
  resolved_at          timestamptz
);

create index pending_connect_transfers_profile_status_idx
  on public.pending_connect_transfers(profile_id, status);

alter table public.pending_connect_transfers enable row level security;

-- 本人（profile_id一致）+ admin が SELECT 可（settle_transfers と同パターン）
create policy "pending_connect_transfers_select_own" on public.pending_connect_transfers
  for select using (profile_id = auth.uid());

create policy "pending_connect_transfers_select_admin" on public.pending_connect_transfers
  for select using (
    (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- INSERT / UPDATE / DELETE は service_role のみ（ポリシーなし = 拒否）
