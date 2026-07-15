-- QRグループ: 名前付きの独立した「複数QRのまとめ」。
-- トラックのデフォルト表示・タイムテーブルのスロット・強制表示のいずれにも
-- 単一QRとまったく同格で指定できる第一級の存在にする。
-- (前回の display_track_qr_configs は「トラックに複数QRを直接ぶら下げる」だけの
--  設計で、名前を付けて他の場所(スロット・強制表示)からも参照する、という
--  要求を満たせなかったため、こちらへ作り直す)

CREATE TABLE public.qr_groups (
  qr_group_id uuid        NOT NULL DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT qr_groups_pkey PRIMARY KEY (qr_group_id)
);

ALTER TABLE public.qr_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qr_groups_select" ON public.qr_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = qr_groups.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "qr_groups_insert" ON public.qr_groups
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = qr_groups.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "qr_groups_update" ON public.qr_groups
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = qr_groups.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "qr_groups_delete" ON public.qr_groups
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = qr_groups.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE TRIGGER update_qr_groups_modtime
  BEFORE UPDATE ON public.qr_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


CREATE TABLE public.qr_group_members (
  id           uuid    NOT NULL DEFAULT gen_random_uuid(),
  qr_group_id  uuid    NOT NULL REFERENCES public.qr_groups(qr_group_id) ON DELETE CASCADE,
  qr_config_id uuid    NOT NULL REFERENCES public.qr_configs(qr_config_id) ON DELETE CASCADE,
  sort_order   integer NOT NULL DEFAULT 0,
  CONSTRAINT qr_group_members_pkey PRIMARY KEY (id),
  CONSTRAINT qr_group_members_unique UNIQUE (qr_group_id, qr_config_id)
);

ALTER TABLE public.qr_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qr_group_members_select" ON public.qr_group_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.qr_groups g
      JOIN public.events e ON e.event_id = g.event_id
      WHERE g.qr_group_id = qr_group_members.qr_group_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "qr_group_members_insert" ON public.qr_group_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.qr_groups g
      JOIN public.events e ON e.event_id = g.event_id
      WHERE g.qr_group_id = qr_group_members.qr_group_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "qr_group_members_delete" ON public.qr_group_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.qr_groups g
      JOIN public.events e ON e.event_id = g.event_id
      WHERE g.qr_group_id = qr_group_members.qr_group_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );


-- display_tracks: 「複数QRを直接ぶら下げる」方式(display_track_qr_configs)を廃止し、
-- 単一QR or 名前付きグループのどちらか一方を指定する方式に統一(スロットと同じ形)
ALTER TABLE public.display_tracks
  ADD COLUMN default_qr_config_id uuid REFERENCES public.qr_configs(qr_config_id) ON DELETE SET NULL,
  ADD COLUMN default_qr_group_id  uuid REFERENCES public.qr_groups(qr_group_id) ON DELETE SET NULL;

-- 既存の display_track_qr_configs データを自動移行する。
-- 1件しか無いトラックは単一QRへ、2件以上あるトラックは同名のグループを新規作成して割り当てる。
DO $$
DECLARE
  r RECORD;
  new_group_id uuid;
  member_count integer;
BEGIN
  FOR r IN
    SELECT track_id, event_id, name FROM public.display_tracks WHERE deleted_at IS NULL
  LOOP
    SELECT count(*) INTO member_count FROM public.display_track_qr_configs WHERE track_id = r.track_id;

    IF member_count > 1 THEN
      INSERT INTO public.qr_groups (event_id, name) VALUES (r.event_id, r.name || '（自動移行グループ）')
        RETURNING qr_group_id INTO new_group_id;
      INSERT INTO public.qr_group_members (qr_group_id, qr_config_id, sort_order)
        SELECT new_group_id, qr_config_id, sort_order FROM public.display_track_qr_configs WHERE track_id = r.track_id;
      UPDATE public.display_tracks SET default_qr_group_id = new_group_id WHERE track_id = r.track_id;
    ELSIF member_count = 1 THEN
      UPDATE public.display_tracks SET default_qr_config_id = (
        SELECT qr_config_id FROM public.display_track_qr_configs WHERE track_id = r.track_id LIMIT 1
      ) WHERE track_id = r.track_id;
    END IF;
  END LOOP;
END $$;

DROP TABLE public.display_track_qr_configs;

ALTER TABLE public.display_tracks
  ADD CONSTRAINT display_tracks_default_single_ref CHECK (
    default_qr_config_id IS NULL OR default_qr_group_id IS NULL
  );


-- display_schedules: スロットにも単一QRと同格でグループを指定できるようにする
ALTER TABLE public.display_schedules
  ADD COLUMN qr_group_id uuid REFERENCES public.qr_groups(qr_group_id) ON DELETE SET NULL,
  ADD CONSTRAINT display_schedules_qr_single_ref CHECK (
    qr_config_id IS NULL OR qr_group_id IS NULL
  );
