-- ==========================================
-- transactions: 照合用カラム追加
-- ==========================================
alter table public.transactions
  add column if not exists amount_verified        boolean,      -- 金額チェック結果
  add column if not exists amount_mismatch        bigint,       -- 不一致額（0なら一致）
  add column if not exists stripe_fee_actual      bigint,       -- Stripeの実際の手数料
  add column if not exists stripe_net_actual      bigint,       -- Stripe手数料控除後の実額
  add column if not exists reconciled_at          timestamptz,  -- バッチ照合完了時刻
  add column if not exists reconcile_error        text;         -- 照合エラーメッセージ

-- ==========================================
-- reconciliation_logs テーブル
-- バッチ実行ログ
-- ==========================================
create table public.reconciliation_logs (
  log_id            uuid default gen_random_uuid() primary key,
  run_at            timestamptz default now() not null,
  target_date       date not null,
  total_checked     integer not null default 0,
  total_matched     integer not null default 0,
  total_mismatched  integer not null default 0,
  total_errors      integer not null default 0,
  summary           jsonb,
  created_at        timestamptz default now() not null
);

alter table public.reconciliation_logs enable row level security;
-- admin のみ参照
create policy "reconciliation_logs_select_admin" on public.reconciliation_logs
  for select using (
    (select role from public.profiles where profile_id = auth.uid()) = 'admin'
  );
