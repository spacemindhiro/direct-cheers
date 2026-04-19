CREATE TABLE public.notifications (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES public.profiles(profile_id) ON DELETE CASCADE,
  type            text NOT NULL,
  title           text NOT NULL,
  body            text NOT NULL DEFAULT '',
  metadata        jsonb,
  is_read         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_profile_unread_idx ON public.notifications (profile_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 本人のみ参照・既読更新可
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (profile_id = auth.uid());
