alter table public.profiles
  add column if not exists stripe_restricted boolean not null default false;
