-- イベント承認後、オーガナイザーと担当エージェントがメッセージできるようにする。
-- 既存のconversationsはevent_artist_id経由(オーガナイザー↔アーティスト)前提だったため、
-- event_id直結・type='agent'の会話を追加できるよう拡張する。
-- 会話は「イベント×担当エージェント」単位で分ける。エージェント引き継ぎ(handoff)時に、
-- 新エージェントへ旧エージェントとの会話履歴が見えないようにするため。
--
-- 【最終形】20260912010000_add_agent_conversations と 20260913000000_agent_conversation_per_agent を
-- 1本にまとめたもの。hotfixのDB変更(20261014000000)が本番に先に入り日付が逆転したため、
-- 古い2本を削除して最新日付で作り直した(scripts/check-migrations.sh 冒頭の解消ルール)。
-- STG(古い2本が反映済み)・本番(未反映)のどちらから流しても同じ結果になるよう書いている。

alter table public.conversations
  add column if not exists event_id uuid references public.events(event_id) on delete cascade;

alter table public.conversations
  add column if not exists agent_profile_id uuid references public.profiles(profile_id);

alter table public.conversations
  drop constraint if exists conversations_type_check,
  add constraint conversations_type_check check (type in ('booking', 'direct', 'agent'));

-- 旧版(1イベントにつきagent会話1つ)の一意制約が残っていれば外す
drop index if exists conversations_event_id_agent_uidx;

-- 担当エージェントが未記入のagent会話は、現在のevents.agent_idで補完する
-- (STGで旧版のときに作られた会話向け。本番にはagent会話がまだ無い)
update public.conversations c
set agent_profile_id = e.agent_id
from public.events e
where c.event_id = e.event_id
  and c.type = 'agent'
  and c.agent_profile_id is null;

create unique index if not exists conversations_event_id_agent_profile_uidx
  on public.conversations (event_id, agent_profile_id)
  where type = 'agent';
