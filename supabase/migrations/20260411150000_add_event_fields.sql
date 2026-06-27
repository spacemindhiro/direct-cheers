-- ==========================================
-- Add venue to events
-- ==========================================
alter table public.events
  add column if not exists venue text;

-- ==========================================
-- Add product type + max_amount to products
-- ==========================================
alter table public.products
  add column if not exists type text
    check (type in ('standard', 'message', 'entrance', 'custom'))
    default 'standard' not null;

alter table public.products
  add column if not exists max_amount bigint not null default 5000;

-- ==========================================
-- Product type price range reference
-- standard  : 500  〜 5,000
-- message   : 1,000 〜 10,000
-- entrance  : 300  〜 3,000
-- custom    : 500  〜 100,000
-- ==========================================

-- ==========================================
-- RLS additions
-- ==========================================

-- events INSERT: active な organizer のみ
create policy "events_insert_organizer_active" on public.events
  for insert with check (
    auth.uid() = organizer_profile_id
    and (select status from public.profiles where profile_id = auth.uid()) = 'active'
    and (select role   from public.profiles where profile_id = auth.uid()) = 'organizer'
  );

-- events SELECT: 自分が主催 or 自分が agent_id or event_artists に登録済みのアーティスト
create policy "events_select" on public.events
  for select using (
    auth.uid() = organizer_profile_id
    or auth.uid() = agent_id
    or exists (
      select 1 from public.event_artists ea
      where ea.event_id = events.event_id
        and ea.artist_profile_id = auth.uid()
        and ea.deleted_at is null
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- events UPDATE: organizer（draft のみ）または agent（draft → published）
create policy "events_update" on public.events
  for update using (
    auth.uid() = organizer_profile_id
    or auth.uid() = agent_id
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- event_artists INSERT/SELECT: organizer of the event
create policy "event_artists_insert" on public.event_artists
  for insert with check (
    exists (
      select 1 from public.events e
      where e.event_id = event_artists.event_id
        and e.organizer_profile_id = auth.uid()
    )
  );

create policy "event_artists_select" on public.event_artists
  for select using (
    artist_profile_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.event_id = event_artists.event_id
        and (e.organizer_profile_id = auth.uid() or e.agent_id = auth.uid())
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- products INSERT/SELECT
create policy "products_insert" on public.products
  for insert with check (
    exists (
      select 1 from public.events e
      where e.event_id = products.event_id
        and e.organizer_profile_id = auth.uid()
    )
  );

create policy "products_select" on public.products
  for select using (
    artist_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.event_id = products.event_id
        and (e.organizer_profile_id = auth.uid() or e.agent_id = auth.uid())
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- qr_configs INSERT/SELECT
create policy "qr_configs_insert" on public.qr_configs
  for insert with check (
    creator_profile_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.event_id = qr_configs.event_id
        and e.lifecycle_status = 'published'
        and (e.organizer_profile_id = auth.uid() or e.agent_id = auth.uid())
    )
  );

create policy "qr_configs_select" on public.qr_configs
  for select using (
    creator_profile_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.event_id = qr_configs.event_id
        and (e.organizer_profile_id = auth.uid() or e.agent_id = auth.uid())
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- qr_config_targets INSERT/SELECT
create policy "qr_config_targets_insert" on public.qr_config_targets
  for insert with check (
    exists (
      select 1 from public.qr_configs qc
      join public.events e on e.event_id = qc.event_id
      where qc.qr_config_id = qr_config_targets.qr_config_id
        and (e.organizer_profile_id = auth.uid() or e.agent_id = auth.uid())
    )
  );

create policy "qr_config_targets_select" on public.qr_config_targets
  for select using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.qr_configs qc
      join public.events e on e.event_id = qc.event_id
      where qc.qr_config_id = qr_config_targets.qr_config_id
        and (e.organizer_profile_id = auth.uid() or e.agent_id = auth.uid())
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );

-- transactions SELECT: 自分が関与するもの
create policy "transactions_select" on public.transactions
  for select using (
    sender_profile_id = auth.uid()
    or exists (
      select 1 from public.products p
      join public.events e on e.event_id = p.event_id
      where p.product_id = transactions.product_id
        and (p.artist_id = auth.uid() or e.organizer_profile_id = auth.uid() or e.agent_id = auth.uid())
    )
    or (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );
