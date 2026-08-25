-- 代打（エージェント引き継ぎ）機能
-- 現担当エージェントが、他のアクティブなエージェントへイベント担当を引き継げるようにする。
-- 承認(events.agent_id の更新)は代打先エージェントが承諾した時点で初めて成立する。

create table public.event_agent_handoffs (
  handoff_id    uuid default gen_random_uuid() primary key,
  event_id      uuid references public.events(event_id) on delete cascade not null,
  from_agent_id uuid references public.profiles(profile_id) on delete restrict not null,
  to_agent_id   uuid references public.profiles(profile_id) on delete restrict not null,
  status        text check (status in ('pending', 'accepted', 'rejected', 'cancelled')) default 'pending' not null,
  requested_at  timestamptz default now() not null,
  responded_at  timestamptz,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  constraint event_agent_handoffs_distinct_agents check (from_agent_id != to_agent_id)
);

create index event_agent_handoffs_event_id_idx on public.event_agent_handoffs(event_id);

-- 1イベントにつき進行中(pending)の代打依頼は同時に1件まで
create unique index event_agent_handoffs_one_pending_per_event
  on public.event_agent_handoffs(event_id) where status = 'pending';

create trigger event_agent_handoffs_set_updated_at
  before update on public.event_agent_handoffs
  for each row execute function update_modified_column();

alter table public.event_agent_handoffs enable row level security;

-- SELECT: 依頼元/依頼先エージェント、イベント主催者、admin
-- INSERT/UPDATEはapp/api/events/[eventId]/handoff配下のAPIルートがadminクライアント経由で
-- 認可ロジック（現担当エージェント本人のみ依頼可、依頼先本人のみ承諾/却下可等）を検証した上で行う。
create policy "event_agent_handoffs_select" on public.event_agent_handoffs
  for select using (
    auth.uid() = from_agent_id
    or auth.uid() = to_agent_id
    or exists (
      select 1 from public.events e
      where e.event_id = event_agent_handoffs.event_id
        and e.organizer_profile_id = auth.uid()
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );
