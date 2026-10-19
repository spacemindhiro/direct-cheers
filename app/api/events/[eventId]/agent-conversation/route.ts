import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAgentConversation } from "@/lib/messaging/ensure-agent-conversation";

// POST /api/events/[eventId]/agent-conversation
// オーガナイザー↔エージェントの会話を取得、無ければ作成して返す
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await supabase
    .from("events")
    .select("event_id, organizer_profile_id, agent_id")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const isParty =
    event.organizer_profile_id === user.id ||
    event.agent_id === user.id ||
    profile?.role === "admin";

  if (!isParty) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const conversationId = await ensureAgentConversation(eventId, event.organizer_profile_id, event.agent_id);

  if (!conversationId) {
    return NextResponse.json({ error: "この組み合わせでは会話を作成できません" }, { status: 400 });
  }

  return NextResponse.json({ conversation_id: conversationId });
}
