-- ==========================================
-- follows テーブル
-- 誰でも誰でもフォロー可能（fan→artist, fan→organizer, artist→organizer 等）
-- ==========================================
CREATE TABLE public.follows (
  follow_id       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id     uuid NOT NULL REFERENCES public.profiles(profile_id) ON DELETE CASCADE,
  followee_id     uuid NOT NULL REFERENCES public.profiles(profile_id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- 自分自身をフォロー不可
  CONSTRAINT follows_no_self_follow CHECK (follower_id <> followee_id),
  -- 重複フォロー不可
  CONSTRAINT follows_unique UNIQUE (follower_id, followee_id)
);

CREATE INDEX follows_follower_idx ON public.follows (follower_id);
CREATE INDEX follows_followee_idx ON public.follows (followee_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- 自分がフォローしているレコードは参照可能
CREATE POLICY "follows_select" ON public.follows
  FOR SELECT USING (follower_id = auth.uid() OR followee_id = auth.uid());

-- フォロー：自分の follower_id でのみ挿入可
CREATE POLICY "follows_insert" ON public.follows
  FOR INSERT WITH CHECK (follower_id = auth.uid());

-- アンフォロー：自分のレコードのみ削除可
CREATE POLICY "follows_delete" ON public.follows
  FOR DELETE USING (follower_id = auth.uid());

-- ==========================================
-- 通知基盤：フォロワーへの通知キュー
-- イベント作成・出演登録時にここにレコードを積む。
-- メール/プッシュ送信ワーカーがここを読んで送信する。
-- ==========================================
CREATE TABLE public.follow_notifications (
  notification_id   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id       uuid NOT NULL REFERENCES public.profiles(profile_id) ON DELETE CASCADE,
  followee_id       uuid NOT NULL REFERENCES public.profiles(profile_id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN (
    'new_event',        -- フォロー中のオーガナイザーがイベントを作成
    'artist_appearing', -- フォロー中のアーティストが出演
    'event_started',    -- フォロー中イベントが開始
    'new_release'       -- フォロー中アーティストの新着
  )),
  payload           jsonb,         -- イベントID・タイトル等
  sent_at           timestamptz,   -- 送信済み時刻（null = 未送信）
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX follow_notifications_unsent_idx ON public.follow_notifications (sent_at) WHERE sent_at IS NULL;
CREATE INDEX follow_notifications_follower_idx ON public.follow_notifications (follower_id);

ALTER TABLE public.follow_notifications ENABLE ROW LEVEL SECURITY;
-- サービスロールのみ操作（通知ワーカー用）
