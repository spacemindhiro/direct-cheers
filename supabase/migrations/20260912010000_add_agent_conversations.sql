-- イベント承認後、オーガナイザーと担当エージェントがメッセージできるようにする。
-- 既存のconversationsはevent_artist_id経由(オーガナイザー↔アーティスト)前提だったため、
-- event_id直結・type='agent'の会話を追加できるよう拡張する。

alter table public.conversations
  add column event_id uuid references public.events(event_id) on delete cascade;

alter table public.conversations
  drop constraint conversations_type_check,
  add constraint conversations_type_check check (type in ('booking', 'direct', 'agent'));

-- 1イベントにつきagent会話は1つまで（承認処理の重複実行に対する保険）
create unique index conversations_event_id_agent_uidx
  on public.conversations (event_id)
  where type = 'agent';
