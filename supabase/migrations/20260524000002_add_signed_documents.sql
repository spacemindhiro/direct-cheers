create table if not exists public.signed_documents (
  id                    uuid        primary key default gen_random_uuid(),
  profile_id            uuid        not null references public.profiles(profile_id) on delete cascade,
  signed_by             uuid        not null references public.profiles(profile_id),
  terms_types           text[]      not null,
  terms_version         text        not null,
  admin_signature_path  text        not null,
  subject_signature_path text       not null,
  signed_at             timestamptz not null default now()
);

alter table public.signed_documents enable row level security;

create policy "admin can read all signed documents"
  on public.signed_documents for select
  using (
    exists (
      select 1 from public.profiles
      where profile_id = auth.uid() and role = 'admin'
    )
  );

create policy "users can read own signed documents"
  on public.signed_documents for select
  using (auth.uid() = profile_id);

create policy "admin can insert signed documents"
  on public.signed_documents for insert
  with check (
    exists (
      select 1 from public.profiles
      where profile_id = auth.uid() and role = 'admin'
    )
  );

-- Storage バケット作成（Supabase Dashboardで手動作成が必要な場合もある）
insert into storage.buckets (id, name, public)
values ('signed-agreements', 'signed-agreements', false)
on conflict (id) do nothing;

create policy "admin can upload signed agreements"
  on storage.objects for insert
  with check (
    bucket_id = 'signed-agreements'
    and exists (
      select 1 from public.profiles
      where profile_id = auth.uid() and role = 'admin'
    )
  );

create policy "admin can read signed agreements"
  on storage.objects for select
  using (
    bucket_id = 'signed-agreements'
    and exists (
      select 1 from public.profiles
      where profile_id = auth.uid() and role = 'admin'
    )
  );

create policy "users can read own signed agreements"
  on storage.objects for select
  using (
    bucket_id = 'signed-agreements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
