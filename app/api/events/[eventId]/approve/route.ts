import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEventApprovedEmail } from "@/lib/email/notification";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // agent または admin のみ
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!["agent", "admin"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 自分が担当 agent のイベントのみ承認可能（admin は全件）
  const { data: event } = await supabase
    .from("events")
    .select("event_id, agent_id, lifecycle_status, organizer_profile_id")
    .eq("event_id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // セルフ承認ガード: organizer 本人が agent を兼ねている場合は admin のみ承認可
  if (event.agent_id === event.organizer_profile_id && profile?.role !== "admin") {
    return NextResponse.json({ error: "自身が主催するイベントは管理者のみ承認できます" }, { status: 403 });
  }

  if (profile?.role === "agent" && event.agent_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (event.lifecycle_status !== "review_requested") {
    return NextResponse.json({ error: "承認依頼中のイベントのみ承認できます" }, { status: 400 });
  }

  const { data: eventDetail, error } = await supabase
    .from("events")
    .update({ lifecycle_status: "published" })
    .eq("event_id", eventId)
    .select("title, organizer_profile_id, venue, start_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const admin = createAdminClient();

  // オーガナイザーへ承認通知 + メール
  try {
    await admin.from("notifications").insert({
      profile_id: eventDetail.organizer_profile_id,
      type: "event_approved",
      title: "イベントが承認されました",
      body: `「${eventDetail.title}」がエージェントに承認され、公開されました。`,
      metadata: { event_id: eventId },
    });

    const { data: authUser } = await admin.auth.admin.getUserById(eventDetail.organizer_profile_id);
    const email = authUser.user?.email;
    if (email) {
      sendEventApprovedEmail({ to: email, eventId, eventTitle: eventDetail.title }).catch(() => {});
    }
  } catch { /* 通知失敗はサイレントに */ }

  // フォロワーへの通知キュー（new_event / artist_appearing）
  try {
    const notificationRows: {
      follower_id: string;
      followee_id: string;
      notification_type: string;
      payload: Record<string, unknown>;
    }[] = [];

    // オーガナイザーのフォロワーに「new_event」通知
    const { data: organizerFollowers } = await admin
      .from("follows")
      .select("follower_id")
      .eq("followee_id", eventDetail.organizer_profile_id);

    for (const f of organizerFollowers ?? []) {
      notificationRows.push({
        follower_id: f.follower_id,
        followee_id: eventDetail.organizer_profile_id,
        notification_type: "new_event",
        payload: { event_id: eventId, title: eventDetail.title, venue: eventDetail.venue, start_at: eventDetail.start_at },
      });
    }

    // 出演確定アーティストのフォロワーに「artist_appearing」通知
    const { data: confirmedArtists } = await admin
      .from("event_artists")
      .select("artist_profile_id")
      .eq("event_id", eventId)
      .eq("status", "confirmed")
      .is("deleted_at", null);

    for (const { artist_profile_id: artistId } of confirmedArtists ?? []) {
      const { data: artistFollowers } = await admin
        .from("follows")
        .select("follower_id")
        .eq("followee_id", artistId);

      for (const f of artistFollowers ?? []) {
        notificationRows.push({
          follower_id: f.follower_id,
          followee_id: artistId,
          notification_type: "artist_appearing",
          payload: { event_id: eventId, title: eventDetail.title, venue: eventDetail.venue, start_at: eventDetail.start_at, artist_id: artistId },
        });
      }
    }

    if (notificationRows.length > 0) {
      await admin.from("follow_notifications").insert(notificationRows);
    }
  } catch (err) {
    console.error("[events/approve] notification queue error:", err);
  }

  return NextResponse.json({ success: true });
}
