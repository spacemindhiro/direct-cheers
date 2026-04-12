-- ==========================================
-- event_thanks: アーティスト/オーガナイザーから購入者へのサンクス特典
-- ==========================================
CREATE TABLE public.event_thanks (
  event_thanks_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid        NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
  thanks_message   text,
  thanks_link_url  text,
  thanks_media_url text,
  published_at     timestamptz,          -- NULL = 下書き, NOT NULL = 公開済み
  created_by       uuid        NOT NULL REFERENCES public.profiles(profile_id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id)                        -- 1イベント1特典
);

ALTER TABLE public.event_thanks ENABLE ROW LEVEL SECURITY;

-- オーガナイザー・アーティスト・管理者：自分が関係するイベントの特典を管理
CREATE POLICY "event_thanks_manage" ON public.event_thanks
  FOR ALL USING (
    created_by = auth.uid()
    OR (SELECT role FROM public.profiles WHERE profile_id = auth.uid()) IN ('admin')
  );

-- 購入者は公開済み特典を参照可（購入検証はAPIレイヤーで実施）
-- 公開済みのものだけ service role 経由で取得するのでここでは制限なし

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION public.touch_event_thanks_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_thanks_updated_at
  BEFORE UPDATE ON public.event_thanks
  FOR EACH ROW EXECUTE FUNCTION public.touch_event_thanks_updated_at();
