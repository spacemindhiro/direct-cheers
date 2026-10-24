-- QR の販売停止（2026-10-24）
-- ・出演者が辞退し、その人が宛先の QR にすでに決済があるとき：宛先は替えられない（払ったお客様の明細と食い違うため）ので販売を止める
-- ・admin が不正に気づいたとき：QR ごと、またはイベントの QR をまとめて止める（再開も admin だけ）
-- 止めている間は、決済の入口（決済画面・チア決済・前売予約・タッチ決済）がすべて lib/purchase-window.ts で断る。
-- 書き込みはサーバー（service role）だけ。本人による直接の書き込みは 2026-10-14 から許していない
alter table public.qr_configs add column if not exists sales_stopped_at timestamptz;
alter table public.qr_configs add column if not exists sales_stopped_reason text;
alter table public.qr_configs add column if not exists sales_stopped_by uuid references public.profiles(profile_id) on delete set null;

alter table public.qr_configs drop constraint if exists qr_configs_sales_stopped_reason_check;
alter table public.qr_configs add constraint qr_configs_sales_stopped_reason_check
  check (sales_stopped_reason is null or sales_stopped_reason in ('lineup_declined', 'admin'));

-- 止めた・再開した記録（誰が・いつ・なぜ）。読み書きはサーバーだけ（ポリシーを置かない）
create table if not exists public.qr_sales_stop_logs (
  log_id uuid primary key default gen_random_uuid(),
  qr_config_id uuid not null references public.qr_configs(qr_config_id) on delete cascade,
  action text not null check (action in ('stop', 'resume')),
  reason text check (reason is null or reason in ('lineup_declined', 'admin')),
  note text,
  actor_profile_id uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.qr_sales_stop_logs enable row level security;
create index if not exists qr_sales_stop_logs_qr_idx on public.qr_sales_stop_logs (qr_config_id, created_at desc);
