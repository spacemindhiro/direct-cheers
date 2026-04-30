alter table public.transactions
  add column if not exists transaction_type text not null default 'purchase'
  check (transaction_type in ('purchase', 'invitation'));
