create table if not exists public.terms_agreements (
  id          uuid        primary key default gen_random_uuid(),
  profile_id  uuid        not null references public.profiles(profile_id) on delete cascade,
  terms_type  text        not null check (terms_type in ('base', 'organizer', 'agent')),
  version     text        not null,
  agreed_at   timestamptz not null default now(),
  unique (profile_id, terms_type, version)
);

alter table public.terms_agreements enable row level security;

create policy "users can read own agreements"
  on public.terms_agreements for select
  using (auth.uid() = profile_id);

create policy "users can insert own agreements"
  on public.terms_agreements for insert
  with check (auth.uid() = profile_id);
