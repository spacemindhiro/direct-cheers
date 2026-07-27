-- 照合(reconcile)の同一PIグループに対する同時実行防止用ロックテーブル。
-- 2026-07-27、本番で手動照合を実行中にもう一度実行したことで、同一PIの
-- ウェルカムチア2階建て兄弟行が別々のバッチとして処理され、按分の端数(1円)が
-- どちらの行にも配られず消失する不整合が発生した。lib/reconcile-lock.ts が
-- このテーブルを使って同一PIの並行処理を防ぐ。

create table if not exists public.reconcile_pi_locks (
  pi_id      text primary key,
  locked_at  timestamptz not null default now()
);
