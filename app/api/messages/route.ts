import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/messages — ログインユーザーの会話一覧（最新メッセージ付き）
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 自分が参加している会話を取得
  const { data: rows, error } = await supabase
    .from("conversation_participants")
    .select(`
      conversation_id,
      last_read_at,
      conversation:conversations!conversation_id(
        conversation_id, type, updated_at, event_artist_id,
        event_artist:event_artists!event_artist_id(
          event_id,
          event:events!event_id(title)
        )
      )
    `)
    .eq("profile_id", user.id)
    .order("conversation(updated_at)", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const conversationIds = (rows ?? []).map((r) => r.conversation_id);
  if (conversationIds.length === 0) return NextResponse.json([]);

  // 各会話の相手参加者を取得
  const { data: others } = await supabase
    .from("conversation_participants")
    .select("conversation_id, profile_id, profile:profiles!profile_id(display_name, avatar_url)")
    .in("conversation_id", conversationIds)
    .neq("profile_id", user.id);

  // 各会話の最新メッセージを取得
  const { data: lastMsgs } = await supabase
    .from("messages")
    .select("conversation_id, message_id, body, sender_profile_id, message_type, created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  // 各会話の未読数を計算（created_at > last_read_at かつ sender != me）
  const { data: unreadCounts } = await supabase
    .from("messages")
    .select("conversation_id, message_id, sender_profile_id, created_at")
    .in("conversation_id", conversationIds)
    .neq("sender_profile_id", user.id);

  const otherMap = new Map<string, { profile_id: string; display_name: string | null; avatar_url: string | null }>();
  for (const o of others ?? []) {
    const pRaw = o.profile as unknown;
    const p = (Array.isArray(pRaw) ? pRaw[0] : pRaw) as { display_name: string | null; avatar_url: string | null } | null;
    otherMap.set(o.conversation_id, {
      profile_id: o.profile_id,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
    });
  }

  const lastMsgMap = new Map<string, typeof lastMsgs extends (infer T)[] | null ? T : never>();
  for (const m of lastMsgs ?? []) {
    if (!lastMsgMap.has(m.conversation_id)) lastMsgMap.set(m.conversation_id, m);
  }

  const lastReadMap = new Map<string, string | null>();
  for (const r of rows ?? []) lastReadMap.set(r.conversation_id, r.last_read_at);

  const result = (rows ?? []).map((r) => {
    type ConvShape = {
      conversation_id: string;
      type: string;
      updated_at: string;
      event_artist_id: string | null;
      event_artist: { event_id: string; event: { title: string } | null } | null;
    };
    const convRaw = r.conversation as unknown;
    const conv = (Array.isArray(convRaw) ? convRaw[0] : convRaw) as ConvShape | null;

    if (!conv) return null;

    const lastRead = lastReadMap.get(r.conversation_id);
    const unread = (unreadCounts ?? []).filter(
      (m) =>
        m.conversation_id === r.conversation_id &&
        (!lastRead || m.created_at > lastRead)
    ).length;

    return {
      conversation_id: conv.conversation_id,
      type: conv.type,
      updated_at: conv.updated_at,
      event_title: conv.event_artist?.event?.title ?? null,
      event_id: conv.event_artist?.event_id ?? null,
      other_profile: otherMap.get(r.conversation_id) ?? null,
      last_message: lastMsgMap.get(r.conversation_id) ?? null,
      unread_count: unread,
    };
  }).filter(Boolean);

  return NextResponse.json(result);
}
