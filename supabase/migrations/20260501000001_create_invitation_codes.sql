create table public.invitation_codes (
  code_id          uuid primary key default gen_random_uuid(),
  code             text not null unique,
  qr_config_id     uuid not null references public.qr_configs(qr_config_id),
  event_id         uuid not null references public.events(event_id),
  created_by       uuid not null references public.profiles(profile_id),
  used_at          timestamptz,
  used_by_profile_id uuid references public.profiles(profile_id),
  transaction_id   uuid references public.transactions(transaction_id),
  expires_at       timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.invitation_codes enable row level security;
