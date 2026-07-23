import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLineupInviteEmail } from "@/lib/email/notification";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status, responsible_agent_id")
    .eq("profile_id", user.id)
    .single();

  // ロールは上位互換（agent/adminはorganizerの業務も行える）のため、organizer以上を許可
  if (!["organizer", "agent", "admin"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Organizer only" }, { status: 403 });
  }
  if (profile?.status !== "active") {
    return NextResponse.json({ error: "Account not active" }, { status: 403 });
  }
  // organizerは担当agentの監督が必須。agent/adminは自分自身が監督者となるため不要
  // （承認時はapprove/route.tsのセルフ承認ガードにより本人ではなくadminのみ承認可能になる）
  if (profile?.role === "organizer" && !profile?.responsible_agent_id) {
    return NextResponse.json({ error: "No agent assigned" }, { status: 400 });
  }
  const eventAgentId = profile?.role === "organizer" ? profile.responsible_agent_id : user.id;

  const body = await req.json();
  const { title, venue, venue_id, start_at, end_at, artists, artist_ids, serial_scope } = body as {
    title: string;
    venue: string;
    venue_id?: string | null;
    start_at: string;
    end_at: string;
    artists?: { profile_id: string; invite_message?: string | null }[];
    artist_ids?: string[]; // 旧フォーマット後方互換
    serial_scope?: "event" | "artist";
  };
  // 新フォーマット（artists[]）と旧フォーマット（artist_ids[]）の両方をサポート
  const artistList = artists ?? (artist_ids ?? []).map((id) => ({ profile_id: id, invite_message: null }));

  if (!title || !venue || !start_at || !end_at) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // イベント作成
  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      organizer_profile_id: user.id,
      agent_id: eventAgentId,
      title,
      venue,
      venue_id: venue_id || null,
      start_at,
      end_at,
      lifecycle_status: "draft",
      serial_scope: serial_scope ?? "event",
    })
    .select("event_id")
    .single();

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  // アーティスト登録（全員 pending — アーティスト側の承認で confirmed に変わる）
  if (artistList.length > 0) {
    const artistRows = artistList.map((a, i) => ({
      event_id: event.event_id,
      artist_profile_id: a.profile_id,
      performance_order: i + 1,
      status: "pending",
      invite_message: a.invite_message ?? null,
    }));
    const { data: insertedArtists, error: artistError } = await supabase
      .from("event_artists")
      .insert(artistRows)
      .select("event_artist_id, artist_profile_id, invite_message");
    if (artistError) {
      return NextResponse.json({ error: artistError.message }, { status: 500 });
    }

    // 各アーティストごとにメッセージスレッドを作成
    try {
      const admin = createAdminClient();
      for (const ea of insertedArtists ?? []) {
        const { data: conv } = await admin
          .from("conversations")
          .insert({ type: "booking", event_artist_id: ea.event_artist_id })
          .select("conversation_id")
          .single();
        if (!conv) continue;
        await admin.from("conversation_participants").insert([
          { conversation_id: conv.conversation_id, profile_id: user.id },
          { conversation_id: conv.conversation_id, profile_id: ea.artist_profile_id },
        ]);
        if (ea.invite_message?.trim()) {
          await admin.from("messages").insert({
            conversation_id: conv.conversation_id,
            sender_profile_id: user.id,
            body: ea.invite_message.trim(),
            message_type: "text",
          });
        }
      }
    } catch { /* メッセージング失敗は非致死的 */ }

    // 各アーティストへ出演依頼通知
    try {
      const admin = createAdminClient();
      const { data: organizer } = await admin
        .from("profiles")
        .select("display_name, organizer_name")
        .eq("profile_id", user.id)
        .single();

      const organizerDisplayName = organizer?.organizer_name ?? organizer?.display_name ?? "オーガナイザー";

      const notifs = artistList.map((a) => ({
        profile_id: a.profile_id,
        type: "lineup_invite",
        title: "出演依頼が届いています",
        body: `${organizerDisplayName} から「${title}」への出演依頼が届いています。`,
        metadata: { event_id: event.event_id, organizer_id: user.id },
      }));
      await admin.from("notifications").insert(notifs);

      // メール送信（fire-and-forget）
      for (const a of artistList) {
        const { data: authUser } = await admin.auth.admin.getUserById(a.profile_id);
        const email = authUser.user?.email;
        if (email) {
          sendLineupInviteEmail({
            to: email,
            eventId: event.event_id,
            eventTitle: title,
            organizerName: organizerDisplayName,
            artistName: "",
          }).catch(() => {});
        }
      }
    } catch { /* notifications テーブルがなければスキップ */ }
  }

  // フォロワー通知（new_event / artist_appearing）はエージェント承認時に送る

  return NextResponse.json({ event_id: event.event_id });
}
