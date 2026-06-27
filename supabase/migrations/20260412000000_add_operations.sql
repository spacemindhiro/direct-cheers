-- ==========================================
-- event_evidences テーブル
-- イベント終了後にオーガナイザーが提出する実績エビデンス
-- ==========================================
create table public.event_evidences (
  evidence_id       uuid default gen_random_uuid() primary key,
  event_id          uuid references public.events(event_id) on delete cascade not null,
  submitted_by      uuid references public.profiles(profile_id) not null,
  description       text,
  photo_paths       text[] not null default '{}',
  attendance_count  integer,
  created_at        timestamptz default now() not null
);

alter table public.event_evidences enable row level security;

create policy "evidence_select" on public.event_evidences
  for select using (
    (select role from public.profiles where profile_id = auth.uid()) in ('admin', 'agent')
    or exists (
      select 1 from public.events e
      where e.event_id = event_evidences.event_id
        and (e.organizer_profile_id = auth.uid() or e.agent_id = auth.uid())
    )
  );

create policy "evidence_insert" on public.event_evidences
  for insert with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from public.events e
      where e.event_id = event_evidences.event_id
        and e.organizer_profile_id = auth.uid()
    )
  );

-- ==========================================
-- profiles: チャージバックカウント + 残高凍結
-- ==========================================
alter table public.profiles
  add column if not exists chargeback_count   integer     not null default 0,
  add column if not exists balance_frozen     boolean     not null default false,
  add column if not exists balance_frozen_at  timestamptz;

-- ==========================================
-- transaction_distributions: 個別凍結フラグ
-- ==========================================
alter table public.transaction_distributions
  add column if not exists is_frozen boolean not null default false;

-- ==========================================
-- settlement_summaries: 合計金額キャッシュ
-- ==========================================
alter table public.settlement_summaries
  add column if not exists total_gross_amount bigint not null default 0;

-- ==========================================
-- RPC: chargeback_count インクリメント
-- ==========================================
create or replace function increment_chargeback_count(target_profile_id uuid)
returns void language sql security definer as $$
  update public.profiles
  set chargeback_count = chargeback_count + 1
  where profile_id = target_profile_id;
$$;
