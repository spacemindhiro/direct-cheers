-- ============================================================
-- メッセージング機能
-- conversations / conversation_participants / messages
-- 出演依頼（event_artists）と紐づく booking タイプのみ実装。
-- ============================================================

-- ── conversations ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  conversation_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text        NOT NULL DEFAULT 'booking' CHECK (type IN ('booking', 'direct')),
  event_artist_id  uuid        REFERENCES public.event_artists(event_artist_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.conversations IS '1:1メッセージスレッド。';
COMMENT ON COLUMN public.conversations.type IS 'booking=出演依頼起点, direct=相互フォロワー起点（将来）';
COMMENT ON COLUMN public.conversations.event_artist_id IS '出演依頼レコードへの参照（bookingタイプのみ）';

-- ── conversation_participants ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id  uuid        NOT NULL REFERENCES public.conversations(conversation_id) ON DELETE CASCADE,
  profile_id       uuid        NOT NULL REFERENCES public.profiles(profile_id) ON DELETE CASCADE,
  joined_at        timestamptz NOT NULL DEFAULT now(),
  last_read_at     timestamptz,
  PRIMARY KEY (conversation_id, profile_id)
);

COMMENT ON TABLE  public.conversation_participants IS 'スレッドの参加者（常に2名）。';
COMMENT ON COLUMN public.conversation_participants.last_read_at IS '最後に既読した時刻。未読バッジの計算に使用。';

-- ── messages ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  message_id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid        NOT NULL REFERENCES public.conversations(conversation_id) ON DELETE CASCADE,
  sender_profile_id  uuid        REFERENCES public.profiles(profile_id) ON DELETE SET NULL,
  body               text        NOT NULL,
  message_type       text        NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'system')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.messages IS 'スレッド内の各メッセージ。';
COMMENT ON COLUMN public.messages.message_type IS 'text=通常メッセージ, system=承認/辞退などのシステムメッセージ';

-- ── インデックス ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_event_artist_id
  ON public.conversations (event_artist_id);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_profile_id
  ON public.conversation_participants (profile_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at
  ON public.messages (conversation_id, created_at);

-- ── updated_at トリガー ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_conversation_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.conversations
     SET updated_at = now()
   WHERE conversation_id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_update_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_updated_at();

-- ── RLS ───────────────────────────────────────────────────
ALTER TABLE public.conversations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                   ENABLE ROW LEVEL SECURITY;

-- conversations: 参加者のみ読める
CREATE POLICY "conversations_select_participant" ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
       WHERE cp.conversation_id = conversations.conversation_id
         AND cp.profile_id = auth.uid()
    )
  );

-- conversation_participants: 同じスレッドの参加者なら読める
CREATE POLICY "cp_select_participant" ON public.conversation_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp2
       WHERE cp2.conversation_id = conversation_participants.conversation_id
         AND cp2.profile_id = auth.uid()
    )
  );

-- conversation_participants: 自分の last_read_at だけ更新可
CREATE POLICY "cp_update_own" ON public.conversation_participants
  FOR UPDATE USING  (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- messages: 参加者のみ読める
CREATE POLICY "messages_select_participant" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
       WHERE cp.conversation_id = messages.conversation_id
         AND cp.profile_id = auth.uid()
    )
  );

-- messages: 参加者が自分の名前で送信可
CREATE POLICY "messages_insert_participant" ON public.messages
  FOR INSERT WITH CHECK (
    sender_profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
       WHERE cp.conversation_id = messages.conversation_id
         AND cp.profile_id = auth.uid()
    )
  );

-- service_role は全操作可（API サーバーからのバックフィルと連携）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages                  TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.conversations             TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conversation_participants TO authenticated;
GRANT SELECT, INSERT         ON public.messages                  TO authenticated;

-- ── Realtime ──────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ── バックフィル ───────────────────────────────────────────
-- 既存の event_artists から conversation を作成する。
-- 各 event_artists ごとに organizer と artist の間に 1 スレッド。
-- invite_message がある場合はそれを最初のメッセージとして挿入。

DO $$
DECLARE
  r RECORD;
  v_conv_id uuid;
BEGIN
  FOR r IN
    SELECT
      ea.event_artist_id,
      ea.artist_profile_id,
      ea.invite_message,
      e.organizer_profile_id
    FROM public.event_artists ea
    JOIN public.events e ON e.event_id = ea.event_id
    WHERE ea.deleted_at IS NULL
      -- まだ conversation が存在しないものだけ
      AND NOT EXISTS (
        SELECT 1 FROM public.conversations c
         WHERE c.event_artist_id = ea.event_artist_id
      )
  LOOP
    -- conversation 作成
    INSERT INTO public.conversations (type, event_artist_id)
    VALUES ('booking', r.event_artist_id)
    RETURNING conversation_id INTO v_conv_id;

    -- 参加者登録
    INSERT INTO public.conversation_participants (conversation_id, profile_id)
    VALUES
      (v_conv_id, r.organizer_profile_id),
      (v_conv_id, r.artist_profile_id);

    -- invite_message があれば最初のメッセージとして挿入
    IF r.invite_message IS NOT NULL AND trim(r.invite_message) <> '' THEN
      INSERT INTO public.messages (conversation_id, sender_profile_id, body, message_type)
      VALUES (v_conv_id, r.organizer_profile_id, r.invite_message, 'text');
    END IF;
  END LOOP;
END;
$$;
