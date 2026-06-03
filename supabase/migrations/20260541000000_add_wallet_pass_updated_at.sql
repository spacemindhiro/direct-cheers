-- wallet_device_registrations に pass_updated_at を追加
-- Apple Wallet の passesUpdatedSince タグに対応するため、
-- パスが最後に更新された時刻を追跡する。
-- iOS 端末はこのタイムスタンプ以降に更新されたパスのみを引き取りに来る。

ALTER TABLE public.wallet_device_registrations
  ADD COLUMN IF NOT EXISTS pass_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS wallet_device_registrations_serial_updated_idx
  ON public.wallet_device_registrations (serial_number, pass_updated_at);

COMMENT ON COLUMN public.wallet_device_registrations.pass_updated_at
  IS 'パスが最後にpushされた時刻。passesUpdatedSince フィルタに使用。';
