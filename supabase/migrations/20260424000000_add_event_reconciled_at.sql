-- events: イベント単位の照合済みフラグ
alter table public.events
  add column if not exists reconciled_at timestamptz;
