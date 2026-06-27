alter table public.transaction_distributions
  add column if not exists hold_released boolean not null default false;

comment on column public.transaction_distributions.hold_released is
  'trueの場合、14日ホールドをスキップして出金可能とする（admin操作）';
