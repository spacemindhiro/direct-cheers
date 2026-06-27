-- ==========================================
-- Add status column to profiles
-- ==========================================

alter table public.profiles
  add column if not exists status text
    check (status in ('pending_onboarding', 'pending_interview', 'active', 'rejected'))
    default 'pending_onboarding' not null;

-- 既存ユーザーは全員 active（grandfather）
update public.profiles set status = 'active';

-- ==========================================
-- RLS: status ガード
-- ==========================================
-- events INSERT: status = 'active' のユーザーのみ
create policy "events_insert_active_only" on public.events
  for insert with check (
    (select role from public.profiles where profile_id = auth.uid()) = 'user'
    or (select status from public.profiles where profile_id = auth.uid()) = 'active'
  );

-- ==========================================
-- Admin による status 更新ポリシー
-- ==========================================
-- profiles UPDATE: admin のみ status を変更可能
create policy "profiles_update_status_admin" on public.profiles
  for update using (
    (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  )
  with check (
    (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );
