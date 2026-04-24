import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const { data: event } = await supabase
    .from("events")
    .select("event_id, title, lifecycle_status, organizer_profile_id, agent_id")
    .eq("event_id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.organizer_profile_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (event.lifecycle_status !== "draft") {
    return NextResponse.json({ error: "承認依頼できるのはドラフト状態のイベントのみです" }, { status: 400 });
  }

  const { error } = await supabase
    .from("events")
    .update({ lifecycle_status: "review_requested" })
    .eq("event_id", eventId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // エージェントへ承認依頼通知
  if (event.agent_id) {
    try {
      const admin = createAdminClient();
      const { data: organizer } = await admin
        .from("profiles")
        .select("display_name")
        .eq("profile_id", user.id)
        .single();

      await admin.from("notifications").insert({
        profile_id: event.agent_id,
        type: "approval_requested",
        title: "イベントの承認依頼が届きました",
        body: `${organizer?.display_name ?? "オーガナイザー"} から「${event.title}」の承認依頼が届いています。`,
        metadata: { event_id: eventId, organizer_id: user.id },
      });
    } catch { /* 通知失敗はサイレントに */ }
  }

  return NextResponse.json({ success: true });
}
