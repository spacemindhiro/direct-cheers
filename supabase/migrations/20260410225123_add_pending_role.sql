-- profiles: ロールアップグレード申請中の申請ロールを保持するカラムを追加
alter table public.profiles
  add column if not exists pending_role text
    check (pending_role in ('artist', 'organizer', 'agent'))
    default null;
