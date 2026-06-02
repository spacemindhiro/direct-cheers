-- qr_configs.serial_scope の DEFAULT 'event' を NULL に修正
--
-- 【バグの経緯】
-- qr_configs.serial_scope に DEFAULT 'event' が設定されていたため、
-- events.serial_scope を 'artist' や 'qr' に設定しても、
-- assign_serial_number RPC は qr_configs.serial_scope = 'event' を先に読んで
-- 常に event スコープを使ってしまい、artist/qr スコープが機能しなかった。
--
-- 【正しい設計】
-- serial_scope は「qr_config レベルで上書きされていない限り event に従う」べき。
-- qr_configs.serial_scope = NULL の場合は events.serial_scope にフォールバックする。
--
-- 【既存データへの影響】
-- 既存の qr_configs は serial_scope = 'event' が明示的に設定済みなので
-- DEFAULT を変えても挙動は変わらない。
-- 今後の新規 qr_config は NULL となり events.serial_scope を継承する。

-- NOT NULL 制約を外し、DEFAULT も NULL に変更
ALTER TABLE public.qr_configs
  ALTER COLUMN serial_scope DROP NOT NULL,
  ALTER COLUMN serial_scope SET DEFAULT NULL;

-- 既存の 'event' 明示値をクリア（event レベルで制御するので qr_config 側は不要）
UPDATE public.qr_configs SET serial_scope = NULL WHERE serial_scope = 'event';
