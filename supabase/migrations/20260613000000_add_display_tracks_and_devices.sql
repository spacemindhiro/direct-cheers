-- QR子機マルチトラック・タイムテーブル機能
-- display_tracks: イベント内の進行表トラック（ステージ/エリア単位）
-- display_devices: 子機（QR表示端末）のトラック割当
-- display_schedules.track_id: スケジュールスロットをトラックに紐付け（NULL=共通/未割当）

CREATE TABLE public.display_tracks (
  track_id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  event_id              uuid        NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  name                  text        NOT NULL,
  default_qr_config_id  uuid        REFERENCES public.qr_configs(qr_config_id) ON DELETE SET NULL,
  sort_order            integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  CONSTRAINT display_tracks_pkey PRIMARY KEY (track_id)
);

ALTER TABLE public.display_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "display_tracks_select" ON public.display_tracks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = display_tracks.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "display_tracks_insert" ON public.display_tracks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = display_tracks.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "display_tracks_update" ON public.display_tracks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = display_tracks.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "display_tracks_delete" ON public.display_tracks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = display_tracks.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE TRIGGER update_display_tracks_modtime
  BEFORE UPDATE ON public.display_tracks
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


CREATE TABLE public.display_devices (
  event_id      uuid        NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  device_id     uuid        NOT NULL,
  device_name   text,
  track_id      uuid        REFERENCES public.display_tracks(track_id) ON DELETE SET NULL,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT display_devices_pkey PRIMARY KEY (event_id, device_id)
);

ALTER TABLE public.display_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "display_devices_select" ON public.display_devices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = display_devices.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "display_devices_insert" ON public.display_devices
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = display_devices.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "display_devices_update" ON public.display_devices
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = display_devices.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "display_devices_delete" ON public.display_devices
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = display_devices.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE TRIGGER update_display_devices_modtime
  BEFORE UPDATE ON public.display_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


-- スケジュールスロットをトラックに紐付け（NULL = 共通/未割当、後方互換）
ALTER TABLE public.display_schedules
  ADD COLUMN track_id uuid REFERENCES public.display_tracks(track_id) ON DELETE SET NULL;
