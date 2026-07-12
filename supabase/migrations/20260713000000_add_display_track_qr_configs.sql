-- 子機（QR表示）のトラックに複数QRを割り当てられるようにする。
-- これまで display_tracks.default_qr_config_id は単一QRしか持てなかったが、
-- 「客が複数の宛先QRから選んで読み取る」タイル一覧表示を実現するため、
-- 中間テーブル display_track_qr_configs（1トラック:多QR、並び順固定）に置き換える。
-- 1件しか紐付いていないトラックは今まで通り単一QR表示のまま(後方互換)。

CREATE TABLE public.display_track_qr_configs (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  track_id      uuid        NOT NULL REFERENCES public.display_tracks(track_id) ON DELETE CASCADE,
  qr_config_id  uuid        NOT NULL REFERENCES public.qr_configs(qr_config_id) ON DELETE CASCADE,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT display_track_qr_configs_pkey PRIMARY KEY (id),
  CONSTRAINT display_track_qr_configs_unique UNIQUE (track_id, qr_config_id)
);

ALTER TABLE public.display_track_qr_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "display_track_qr_configs_select" ON public.display_track_qr_configs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.display_tracks t
      JOIN public.events e ON e.event_id = t.event_id
      WHERE t.track_id = display_track_qr_configs.track_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "display_track_qr_configs_insert" ON public.display_track_qr_configs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.display_tracks t
      JOIN public.events e ON e.event_id = t.event_id
      WHERE t.track_id = display_track_qr_configs.track_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "display_track_qr_configs_update" ON public.display_track_qr_configs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.display_tracks t
      JOIN public.events e ON e.event_id = t.event_id
      WHERE t.track_id = display_track_qr_configs.track_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "display_track_qr_configs_delete" ON public.display_track_qr_configs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.display_tracks t
      JOIN public.events e ON e.event_id = t.event_id
      WHERE t.track_id = display_track_qr_configs.track_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

-- 既存の default_qr_config_id を新テーブルへ移行(sort_order=0)してから列を廃止
INSERT INTO public.display_track_qr_configs (track_id, qr_config_id, sort_order)
SELECT track_id, default_qr_config_id, 0
FROM public.display_tracks
WHERE default_qr_config_id IS NOT NULL;

ALTER TABLE public.display_tracks
  DROP COLUMN default_qr_config_id;
