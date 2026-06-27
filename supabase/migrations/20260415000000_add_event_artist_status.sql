-- ==========================================
-- event_artists に status カラムを追加（出演交渉フロー）
-- ==========================================

alter table public.event_artists
  add column if not exists status text
    check (status in ('pending', 'confirmed', 'rejected'))
    not null default 'confirmed';

-- 既存レコードは全て confirmed 扱い（過去データ）
update public.event_artists set status = 'confirmed' where status = 'confirmed';

-- ==========================================
-- event_artists の UPDATE RLS（アーティスト自身が承認/辞退）
-- ==========================================
drop policy if exists "event_artists_update" on public.event_artists;

create policy "event_artists_update" on public.event_artists
  for update using (
    -- アーティスト自身が自分の行を更新できる（pending→confirmed or pending→rejected）
    artist_profile_id = auth.uid()
    or
    -- オーガナイザー/エージェントも更新可（削除等）
    exists (
      select 1 from public.get_event_principals(event_artists.event_id) p
      where p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid()
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  )
  with check (
    artist_profile_id = auth.uid()
    or exists (
      select 1 from public.get_event_principals(event_artists.event_id) p
      where p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid()
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- is_event_artist ヘルパーを confirmed のみに絞る
-- （pending/rejected アーティストはイベント参加者とみなさない）
create or replace function public.is_event_artist(p_event_id uuid, p_user_id uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public
as $$
  select exists (
    select 1 from public.event_artists
    where event_id = p_event_id
      and artist_profile_id = p_user_id
      and status = 'confirmed'
      and deleted_at is null
  );
$$;
