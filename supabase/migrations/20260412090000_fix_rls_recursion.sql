-- ==========================================
-- RLS 無限再帰の修正
-- events_select ↔ event_artists_select が互いを参照して再帰するため、
-- SECURITY DEFINER 関数でRLSをバイパスしてクロステーブル参照を解消する
-- ==========================================

-- ヘルパー関数: event_id から organizer と agent を RLS バイパスで取得
create or replace function public.get_event_principals(p_event_id uuid)
  returns table(organizer_profile_id uuid, agent_id uuid)
  language sql
  security definer
  stable
  set search_path = public
as $$
  select organizer_profile_id, agent_id
  from public.events
  where event_id = p_event_id;
$$;

-- ヘルパー関数: ユーザーが event_artists に登録済みか RLS バイパスで確認
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
      and deleted_at is null
  );
$$;

-- ==========================================
-- events_select を再作成（event_artists への直接参照をヘルパーに置換）
-- ==========================================
drop policy if exists "events_select" on public.events;

create policy "events_select" on public.events
  for select using (
    auth.uid() = organizer_profile_id
    or auth.uid() = agent_id
    or public.is_event_artist(event_id, auth.uid())
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- ==========================================
-- event_artists_select を再作成（events への直接参照をヘルパーに置換）
-- ==========================================
drop policy if exists "event_artists_select" on public.event_artists;

create policy "event_artists_select" on public.event_artists
  for select using (
    artist_profile_id = auth.uid()
    or exists (
      select 1 from public.get_event_principals(event_artists.event_id) p
      where p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid()
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- ==========================================
-- event_artists_insert を再作成（events への直接参照をヘルパーに置換）
-- ==========================================
drop policy if exists "event_artists_insert" on public.event_artists;

create policy "event_artists_insert" on public.event_artists
  for insert with check (
    exists (
      select 1 from public.get_event_principals(event_artists.event_id) p
      where p.organizer_profile_id = auth.uid()
    )
  );

-- ==========================================
-- products_insert / products_select を再作成
-- ==========================================
drop policy if exists "products_insert" on public.products;

create policy "products_insert" on public.products
  for insert with check (
    exists (
      select 1 from public.get_event_principals(products.event_id) p
      where p.organizer_profile_id = auth.uid()
    )
  );

drop policy if exists "products_select" on public.products;

create policy "products_select" on public.products
  for select using (
    artist_id = auth.uid()
    or exists (
      select 1 from public.get_event_principals(products.event_id) p
      where p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid()
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- ==========================================
-- qr_configs_insert / qr_configs_select を再作成
-- ==========================================
drop policy if exists "qr_configs_insert" on public.qr_configs;

create policy "qr_configs_insert" on public.qr_configs
  for insert with check (
    creator_profile_id = auth.uid()
    and exists (
      select 1 from public.get_event_principals(qr_configs.event_id) p
      join public.events e on e.event_id = qr_configs.event_id
      where e.lifecycle_status = 'published'
        and (p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid())
    )
  );

drop policy if exists "qr_configs_select" on public.qr_configs;

create policy "qr_configs_select" on public.qr_configs
  for select using (
    creator_profile_id = auth.uid()
    or exists (
      select 1 from public.get_event_principals(qr_configs.event_id) p
      where p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid()
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- ==========================================
-- qr_config_targets を再作成
-- ==========================================
drop policy if exists "qr_config_targets_insert" on public.qr_config_targets;

create policy "qr_config_targets_insert" on public.qr_config_targets
  for insert with check (
    exists (
      select 1 from public.qr_configs qc
      join public.get_event_principals(qc.event_id) p on true
      where qc.qr_config_id = qr_config_targets.qr_config_id
        and (p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid())
    )
  );

drop policy if exists "qr_config_targets_select" on public.qr_config_targets;

create policy "qr_config_targets_select" on public.qr_config_targets
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.qr_configs qc
      join public.get_event_principals(qc.event_id) p on true
      where qc.qr_config_id = qr_config_targets.qr_config_id
        and (p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid())
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- ==========================================
-- transactions_select を再作成
-- ==========================================
drop policy if exists "transactions_select" on public.transactions;

create policy "transactions_select" on public.transactions
  for select using (
    sender_profile_id = auth.uid()
    or exists (
      select 1 from public.products pr
      join public.get_event_principals(pr.event_id) p on true
      where pr.product_id = transactions.product_id
        and (pr.artist_id = auth.uid() or p.organizer_profile_id = auth.uid() or p.agent_id = auth.uid())
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );
