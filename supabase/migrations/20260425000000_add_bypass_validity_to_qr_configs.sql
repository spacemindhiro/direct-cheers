-- qr_configs: テスト用有効期間バイパスフラグ
alter table public.qr_configs
  add column if not exists bypass_validity boolean not null default false;
