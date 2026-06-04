-- 子機タイムテーブル自動切り替え用スケジュールテーブル
CREATE TABLE public.display_schedules (
  schedule_id  uuid        NOT NULL DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  qr_config_id uuid        REFERENCES public.qr_configs(qr_config_id) ON DELETE SET NULL,
  start_at     timestamptz NOT NULL,
  end_at       timestamptz NOT NULL,
  label        text,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CONSTRAINT display_schedules_pkey PRIMARY KEY (schedule_id),
  CONSTRAINT display_schedules_time_check CHECK (end_at > start_at)
);

ALTER TABLE public.display_schedules ENABLE ROW LEVEL SECURITY;

-- オーガナイザー・エージェント・admin が参照・更新可
CREATE POLICY "display_schedules_select" ON public.display_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = display_schedules.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "display_schedules_insert" ON public.display_schedules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = display_schedules.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "display_schedules_update" ON public.display_schedules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = display_schedules.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE POLICY "display_schedules_delete" ON public.display_schedules
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.event_id = display_schedules.event_id
        AND (
          e.organizer_profile_id = auth.uid()
          OR e.agent_id          = auth.uid()
          OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) = 'admin'
        )
    )
  );

CREATE TRIGGER update_display_schedules_modtime
  BEFORE UPDATE ON public.display_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();
