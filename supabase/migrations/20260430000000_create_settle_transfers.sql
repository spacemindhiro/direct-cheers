create table if not exists public.settle_transfers (
  settle_transfer_id uuid primary key default gen_random_uuid(),
  event_id          uuid        not null references public.events(event_id),
  profile_id        uuid        not null references public.profiles(profile_id),
  stripe_transfer_id text       not null unique,
  amount            integer     not null,
  created_at        timestamptz not null default now()
);

create index if not exists settle_transfers_profile_id_idx on public.settle_transfers(profile_id);
create index if not exists settle_transfers_event_id_idx   on public.settle_transfers(event_id);
