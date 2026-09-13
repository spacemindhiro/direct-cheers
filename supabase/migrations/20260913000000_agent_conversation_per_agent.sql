-- エージェント引き継ぎ(handoff)時に、新エージェントへ旧エージェントとの会話履歴が
-- 丸ごと見えてしまう問題を修正するため、1イベント1agent会話ではなく
-- 「イベント×担当エージェント」単位で会話を分離できるようにする。

alter table public.conversations
  add column agent_profile_id uuid references public.profiles(profile_id);

-- 移行前に作られたagent会話は、現在のevents.agent_idを担当エージェントとして補完する
-- （この時点ではまだhandoffで担当が分岐した実績が無い前提のバックフィル）
update public.conversations c
set agent_profile_id = e.agent_id
from public.events e
where c.event_id = e.event_id
  and c.type = 'agent'
  and c.agent_profile_id is null;

drop index if exists conversations_event_id_agent_uidx;

create unique index conversations_event_id_agent_profile_uidx
  on public.conversations (event_id, agent_profile_id)
  where type = 'agent';
