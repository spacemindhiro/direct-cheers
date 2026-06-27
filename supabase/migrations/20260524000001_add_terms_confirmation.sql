alter table public.terms_agreements
  add column if not exists confirmed_at   timestamptz,
  add column if not exists confirmed_by   uuid references public.profiles(profile_id);
