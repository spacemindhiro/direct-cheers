-- 開催証跡（event_evidences）の読み取りを、そのイベントの関係者に絞る。
-- 以前はロールが agent なら担当していないイベントの証跡まで全件読めた（2026-10-21 発見）。
-- 読めるのは admin と、そのイベントの主催者・担当エージェント（アプリの lib/event-access.ts の「操作できる人」と同じ）。
-- 何度流しても同じ結果になる書き方（drop if exists → create）。
drop policy if exists "evidence_select" on public.event_evidences;

create policy "evidence_select" on public.event_evidences
  for select using (
    (select role from public.profiles where profile_id = auth.uid()) = 'admin'
    or exists (
      select 1 from public.get_event_principals(event_evidences.event_id) p
      where p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid()
    )
  );
