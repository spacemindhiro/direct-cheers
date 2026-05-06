-- ==========================================
-- Bug 113: invitations テーブルに is_sent / viewed_at を追加
-- ==========================================

alter table public.invitations
  add column if not exists is_sent  boolean      not null default false,
  add column if not exists viewed_at timestamptz;
