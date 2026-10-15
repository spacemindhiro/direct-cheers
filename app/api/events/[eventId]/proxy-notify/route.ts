import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendProxyEventCreatedEmail } from "@/lib/email/notification";

// 代理作成した下書きを主催者に送る（確認依頼の通知＋メール）。
// 作成しただけでは主催者には何も届かず、担当エージェントがこれを押した時点で初めて届く。
// 再送も可（主催者のダッシュボードのバナーはイベント単位で1件にまとめて表示）
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("event_id, title, organizer_profile_id, agent_id, lifecycle_status")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const isAdmin = profile?.role === "admin";
  const isEventAgent = profile?.role === "agent" && event.agent_id === user.id;
  if (!isAdmin && !isEventAgent) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // 自主開催（主催者＝担当）は送る相手がいない
  if (event.organizer_profile_id === user.id || event.organizer_profile_id === event.agent_id) {
    return NextResponse.json({ error: "自主開催のイベントです" }, { status: 400 });
  }
  if (event.lifecycle_status !== "draft") {
    return NextResponse.json({ error: "下書きのイベントのみ送れます" }, { status: 400 });
  }

  const { data: sender } = await admin
    .from("profiles")
    .select("display_name, organizer_name")
    .eq("profile_id", user.id)
    .single();
  const senderName = sender?.organizer_name ?? sender?.display_name ?? "担当エージェント";

  const { data: notif, error } = await admin.from("notifications").insert({
    profile_id: event.organizer_profile_id,
    type: "proxy_event_created",
    title: `「${event.title}」の内容を確認してください`,
    body: `${senderName} さんがあなたのイベントの下書きを作成しました。内容を確認して承認依頼を送ってください。`,
    metadata: { event_id: eventId, created_by: user.id },
  }).select("created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const { data: authUser } = await admin.auth.admin.getUserById(event.organizer_profile_id);
    const email = authUser.user?.email;
    if (email) {
      sendProxyEventCreatedEmail({
        to: email,
        eventId,
        eventTitle: event.title,
        creatorName: senderName,
      }).catch(() => {});
    }
  } catch { /* メール失敗は非致死的（通知は入っている） */ }

  return NextResponse.json({ sent_at: notif.created_at });
}
