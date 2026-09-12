-- conversation_participants の SELECT ポリシーが自己参照しており、
-- Postgresが「infinite recursion detected in policy for relation "conversation_participants"」
-- (42P17) で必ずエラーになっていた。これにより conversations/messages への
-- 参照ポリシーも連鎖的に同じ再帰に巻き込まれ、メッセージ機能が実装以来
-- 常に動作しなかった。SECURITY DEFINER 関数でRLSを介さずに判定することで
-- 自己参照を断ち切る。

create or replace function public.is_conversation_participant(p_conversation_id uuid, p_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = p_conversation_id
      and profile_id = p_profile_id
  );
$$;

revoke all on function public.is_conversation_participant(uuid, uuid) from public;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;

drop policy if exists cp_select_participant on conversation_participants;
create policy cp_select_participant on conversation_participants
  for select
  using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists conversations_select_participant on conversations;
create policy conversations_select_participant on conversations
  for select
  using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists messages_select_participant on messages;
create policy messages_select_participant on messages
  for select
  using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists messages_insert_participant on messages;
create policy messages_insert_participant on messages
  for insert
  with check (
    sender_profile_id = auth.uid()
    and public.is_conversation_participant(conversation_id, auth.uid())
  );
