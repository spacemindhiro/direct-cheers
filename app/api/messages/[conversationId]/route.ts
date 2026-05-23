import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ conversationId: string }> };

// GET /api/messages/[conversationId] — スレッドのメッセージ一覧 + 既読更新
export async function GET(_req: Request, { params }: Params) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 参加者チェック
  const { data: me } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // メッセージ取得
  const { data: messages, error } = await supabase
    .from("messages")
    .select("message_id, sender_profile_id, body, message_type, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 既読更新
  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("profile_id", user.id);

  // 相手プロフィール
  const { data: others } = await supabase
    .from("conversation_participants")
    .select("profile_id, profile:profiles!profile_id(display_name, avatar_url)")
    .eq("conversation_id", conversationId)
    .neq("profile_id", user.id);

  const other = others?.[0];
  const profile = other?.profile as { display_name: string | null; avatar_url: string | null } | unknown[] | null;
  const profileObj = Array.isArray(profile) ? (profile[0] as { display_name: string | null; avatar_url: string | null } | undefined) : profile;
  const otherProfile = other
    ? {
        profile_id: other.profile_id,
        display_name: profileObj?.display_name ?? null,
        avatar_url: profileObj?.avatar_url ?? null,
      }
    : null;

  // 会話のコンテキスト（イベント情報）
  const { data: conv } = await supabase
    .from("conversations")
    .select(`
      type,
      event_artist:event_artists!event_artist_id(
        status,
        event_id,
        event:events!event_id(title, venue, start_at)
      )
    `)
    .eq("conversation_id", conversationId)
    .single();

  return NextResponse.json({
    conversation_id: conversationId,
    context: conv,
    other_profile: otherProfile,
    messages: messages ?? [],
  });
}

// POST /api/messages/[conversationId] — メッセージ送信
export async function POST(req: Request, { params }: Params) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body } = await req.json() as { body: string };
  if (!body?.trim()) return NextResponse.json({ error: "body is required" }, { status: 400 });

  // 参加者チェック（RLS でも弾かれるが明示的に）
  const { data: me } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: msg, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_profile_id: user.id,
      body: body.trim(),
      message_type: "text",
    })
    .select("message_id, sender_profile_id, body, message_type, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(msg);
}
