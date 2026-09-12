import { createAdminClient } from "@/lib/supabase/admin";

// イベントのオーガナイザー↔エージェントの会話を用意する。
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
    .maybeSingle();

  if (existingConv) return existingConv.conversation_id;

  const { data: conv } = await admin
    .from("conversations")
    .insert({ type: "agent", event_id: eventId })
    .select("conversation_id")
    .single();

  if (!conv) return null;

  await admin.from("conversation_participants").insert([
    { conversation_id: conv.conversation_id, profile_id: organizerProfileId },
    { conversation_id: conv.conversation_id, profile_id: agentId },
  ]);

  return conv.conversation_id;
}
