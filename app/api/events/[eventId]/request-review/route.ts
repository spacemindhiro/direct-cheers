import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendApprovalRequestEmail } from "@/lib/email/notification";

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

  // エージェントへ承認依頼通知 + メール
  try {
    const admin = createAdminClient();
    const { data: organizer } = await admin
      .from("profiles")
      .select("display_name")
      .eq("profile_id", user.id)
      .single();
    const organizerName = organizer?.display_name ?? "オーガナイザー";

    // セルフ承認（agent = organizer）の場合は admin に通知、それ以外はエージェントに通知
    const isSelfOrganized = event.agent_id === user.id;
    let notifyProfileId: string | null = null;
    let notifyEmail: string | null = null;

    if (isSelfOrganized || !event.agent_id) {
      // admin を通知先に
      const { data: admins } = await admin.from("profiles").select("profile_id").eq("role", "admin").limit(1);
      notifyProfileId = admins?.[0]?.profile_id ?? null;
    } else {
      notifyProfileId = event.agent_id;
    }

    if (notifyProfileId) {
      await admin.from("notifications").insert({
        profile_id: notifyProfileId,
        type: "approval_requested",
        title: "イベントの承認依頼が届きました",
        body: `${organizerName} から「${event.title}」の承認依頼が届いています。`,
        metadata: { event_id: eventId, organizer_id: user.id },
      });

      const { data: authUser } = await admin.auth.admin.getUserById(notifyProfileId);
      notifyEmail = authUser.user?.email ?? null;
    }

    if (notifyEmail) {
      await sendApprovalRequestEmail({
        to: notifyEmail,
        eventId,
        eventTitle: event.title,
        organizerName,
      });
    }
  } catch { /* 通知失敗はサイレントに */ }

  return NextResponse.json({ success: true });
}
