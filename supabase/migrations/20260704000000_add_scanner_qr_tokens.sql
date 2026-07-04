create table public.scanner_qr_tokens (
  token       text        primary key,
  action_link text        not null,
  created_by  uuid        references public.profiles(profile_id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '1 hour',
  created_at  timestamptz not null default now()
);

create index scanner_qr_tokens_expires_at_idx
  on public.scanner_qr_tokens(expires_at);

alter table public.scanner_qr_tokens enable row level security;
