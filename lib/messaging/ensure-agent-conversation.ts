import { createAdminClient } from "@/lib/supabase/admin";

// イベントのオーガナイザー↔エージェントの会話を用意する。
// 「イベント×担当エージェント」単位で会話を分ける(担当交代のたびに新しい会話)。
// これにより、代打交代時に旧エージェントとの会話履歴が新エージェントへ
// 見えてしまう(オーガナイザーが旧エージェントについて書いた内容等)ことを防ぐ。
// 既にあれば作らず既存のconversation_idを返す。本人が自分の担当(自主催)の場合はnull。
export async function ensureAgentConversation(
  eventId: string,
  organizerProfileId: string,
  agentId: string | null,
): Promise<string | null> {
  if (!agentId || agentId === organizerProfileId) return null;

  const admin = createAdminClient();

  const { data: existingConv } = await admin
    .from("conversations")
    .select("conversation_id")
    .eq("event_id", eventId)
    .eq("type", "agent")
    .eq("agent_profile_id", agentId)
    .maybeSingle();

  if (existingConv) return existingConv.conversation_id;

  const { data: conv } = await admin
    .from("conversations")
    .insert({ type: "agent", event_id: eventId, agent_profile_id: agentId })
    .select("conversation_id")
    .single();

  if (!conv) return null;

  await admin.from("conversation_participants").insert([
    { conversation_id: conv.conversation_id, profile_id: organizerProfileId },
    { conversation_id: conv.conversation_id, profile_id: agentId },
  ]);

  return conv.conversation_id;
}
