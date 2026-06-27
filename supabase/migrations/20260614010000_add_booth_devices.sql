-- NFCタグ⇔子機タブレット ペアリング管理
-- booth_devices: 物理デバイス(device_code)とNFCタグ(nfc_routing_id)の1対1紐付け、
-- および現在表示中のQR(current_qr_config_id)を保持。
-- /r/[nfcRoutingId] はこのテーブルを見て /c/[qrConfigId] へリダイレクトする。

CREATE TABLE public.booth_devices (
  device_code          text        NOT NULL,
  nfc_routing_id       text        UNIQUE,
  current_event_id     uuid        REFERENCES public.events(event_id) ON DELETE SET NULL,
  current_qr_config_id uuid        REFERENCES public.qr_configs(qr_config_id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booth_devices_pkey PRIMARY KEY (device_code)
);

ALTER TABLE public.booth_devices ENABLE ROW LEVEL SECURITY;

-- organizer/agent/admin が参照・登録・更新可能（display_devices等と同じロール方針）
CREATE POLICY "booth_devices_select" ON public.booth_devices
  FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) IN ('organizer','agent','admin')
  );

CREATE POLICY "booth_devices_insert" ON public.booth_devices
  FOR INSERT WITH CHECK (
    (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) IN ('organizer','agent','admin')
  );

CREATE POLICY "booth_devices_update" ON public.booth_devices
  FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) IN ('organizer','agent','admin')
  );

CREATE TRIGGER update_booth_devices_modtime
  BEFORE UPDATE ON public.booth_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
