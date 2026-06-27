create table public.admin_messages (
  id               uuid        primary key default gen_random_uuid(),
  user_profile_id  uuid        not null references public.profiles(profile_id) on delete cascade,
  sender_id        uuid        not null references public.profiles(profile_id),
  body             text        not null check (char_length(body) between 1 and 2000),
  is_from_admin    boolean     not null default true,
  is_read_by_user  boolean     not null default false,
  is_read_by_admin boolean     not null default true,
  created_at       timestamptz not null default now()
);

alter table public.admin_messages enable row level security;

-- admin は全件読み書き可
create policy "admin read all"
  on public.admin_messages for select
  using (exists (select 1 from public.profiles where profile_id = auth.uid() and role = 'admin'));

create policy "admin insert"
  on public.admin_messages for insert
  with check (exists (select 1 from public.profiles where profile_id = auth.uid() and role = 'admin'));

create policy "admin update"
  on public.admin_messages for update
  using (exists (select 1 from public.profiles where profile_id = auth.uid() and role = 'admin'));

-- ユーザーは自分宛のメッセージを読める
create policy "user read own"
  on public.admin_messages for select
  using (user_profile_id = auth.uid());

-- ユーザーは返信のみ投稿可（is_from_admin=false 固定）
create policy "user insert reply"
  on public.admin_messages for insert
  with check (
    user_profile_id = auth.uid()
    and sender_id   = auth.uid()
    and is_from_admin = false
  );

-- ユーザーは既読フラグだけ更新可
create policy "user mark read"
  on public.admin_messages for update
  using (user_profile_id = auth.uid());
