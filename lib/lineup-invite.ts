import { createAdminClient } from "@/lib/supabase/admin";
import { sendLineupInviteEmail } from "@/lib/email/notification";

type AdminClient = ReturnType<typeof createAdminClient>;

export type LineupInvite = {
  event_artist_id: string;
  artist_profile_id: string;
  invite_message?: string | null;
};

// 出演依頼を送る：出演者ごとのメッセージスレッド（無ければ作成。依頼メッセージがあれば投稿）＋通知＋メール。
// 下書きのイベントでは送らず、主催者が承認依頼を送った時点（request-review）でまとめて送る。
// 送ったかどうかは lineup_invite 通知の有無で判定する（findUnsentLineupInvites）
export async function sendLineupInvites(admin: AdminClient, opts: {
  eventId: string;
  eventTitle: string;
  organizerId: string;
  messageSenderId: string;
  invites: LineupInvite[];
}) {
  if (opts.invites.length === 0) return;

  try {
    for (const ea of opts.invites) {
      const { data: existingConv } = await admin
        .from("conversations")
        .select("conversation_id")
        .eq("event_artist_id", ea.event_artist_id)
        .maybeSingle();
      let conversationId = existingConv?.conversation_id;
      if (!conversationId) {
        const { data: conv } = await admin
          .from("conversations")
          .insert({ type: "booking", event_artist_id: ea.event_artist_id })
          .select("conversation_id")
          .single();
        if (!conv) continue;
        conversationId = conv.conversation_id;
        await admin.from("conversation_participants").insert([
          { conversation_id: conversationId, profile_id: opts.organizerId },
          { conversation_id: conversationId, profile_id: ea.artist_profile_id },
        ]);
      }
      if (ea.invite_message?.trim()) {
        await admin.from("messages").insert({
          conversation_id: conversationId,
          sender_profile_id: opts.messageSenderId,
          body: ea.invite_message.trim(),
          message_type: "text",
        });
      }
    }
  } catch { /* メッセージング失敗は非致死的 */ }

  try {
    const { data: organizer } = await admin
      .from("profiles")
      .select("display_name, organizer_name")
      .eq("profile_id", opts.organizerId)
      .single();
    const organizerDisplayName = organizer?.organizer_name ?? organizer?.display_name ?? "オーガナイザー";

    await admin.from("notifications").insert(opts.invites.map((ea) => ({
      profile_id: ea.artist_profile_id,
      type: "lineup_invite",
      title: "出演依頼が届いています",
      body: `${organizerDisplayName} から「${opts.eventTitle}」への出演依頼が届いています。`,
      metadata: { event_id: opts.eventId, organizer_id: opts.organizerId },
    })));

    // メール送信（fire-and-forget）
    for (const ea of opts.invites) {
      const { data: authUser } = await admin.auth.admin.getUserById(ea.artist_profile_id);
      const email = authUser.user?.email;
      if (email) {
        sendLineupInviteEmail({
          to: email,
          eventId: opts.eventId,
          eventTitle: opts.eventTitle,
          organizerName: organizerDisplayName,
          artistName: "",
        }).catch(() => {});
      }
    }
  } catch { /* 通知失敗は非致死的 */ }
}

// 回答待ち（pending）なのに、まだ出演依頼の通知を送っていない出演者
export async function findUnsentLineupInvites(admin: AdminClient, eventId: string): Promise<LineupInvite[]> {
  const { data: rows } = await admin
    .from("event_artists")
    .select("event_artist_id, artist_profile_id, invite_message")
    .eq("event_id", eventId)
    .eq("status", "pending")
    .is("deleted_at", null);
  if (!rows || rows.length === 0) return [];
  const { data: sent } = await admin
    .from("notifications")
    .select("profile_id")
    .eq("type", "lineup_invite")
    .filter("metadata->>event_id", "eq", eventId)
    .in("profile_id", rows.map((r) => r.artist_profile_id));
  const sentIds = new Set((sent ?? []).map((n) => n.profile_id));
  return rows.filter((r) => !sentIds.has(r.artist_profile_id));
}
