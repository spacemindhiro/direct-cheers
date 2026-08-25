import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendHandoffRequestEmail, sendHandoffResponseEmail } from "@/lib/email/notification";

const HANDOFF_ELIGIBLE_STATUSES = ["review_requested", "published", "ongoing"];

// 現担当エージェントが代打を依頼
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { to_agent_id } = await req.json() as { to_agent_id?: string };
  if (!to_agent_id) return NextResponse.json({ error: "to_agent_id is required" }, { status: 400 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, organizer_name")
    .eq("profile_id", user.id)
    .single();

  if (profile?.role !== "agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: event } = await supabase
    .from("events")
    .select("event_id, title, agent_id, lifecycle_status")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  if (event.agent_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!HANDOFF_ELIGIBLE_STATUSES.includes(event.lifecycle_status)) {
    return NextResponse.json({ error: "このステータスのイベントは代打を依頼できません" }, { status: 400 });
  }

  if (to_agent_id === user.id) {
    return NextResponse.json({ error: "自分自身には依頼できません" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: toAgent } = await admin
    .from("profiles")
    .select("role, status, display_name")
    .eq("profile_id", to_agent_id)
    .single();

  if (!toAgent || toAgent.role !== "agent" || toAgent.status !== "active") {
    return NextResponse.json({ error: "依頼先が有効なエージェントではありません" }, { status: 400 });
  }

  const { data: handoff, error } = await admin
    .from("event_agent_handoffs")
    .insert({ event_id: eventId, from_agent_id: user.id, to_agent_id })
    .select("handoff_id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "このイベントには既に進行中の代打依頼があります" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fromAgentName = profile?.organizer_name ?? profile?.display_name ?? "エージェント";

  try {
    await admin.from("notifications").insert({
      profile_id: to_agent_id,
      type: "handoff_requested",
      title: "代打の依頼が届きました",
      body: `${fromAgentName} さんから「${event.title}」の代打を依頼されています。`,
      metadata: { event_id: eventId, handoff_id: handoff.handoff_id },
    });

    const { data: authUser } = await admin.auth.admin.getUserById(to_agent_id);
    const email = authUser.user?.email;
    if (email) {
      sendHandoffRequestEmail({
        to: email,
        eventId,
        eventTitle: event.title,
        fromAgentName,
      }).catch(() => {});
    }
  } catch { /* 通知失敗はサイレントに */ }

  return NextResponse.json({ success: true, handoff_id: handoff.handoff_id });
}

// 代打先エージェントが承諾/却下
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { handoff_id, action } = await req.json() as { handoff_id?: string; action?: "accept" | "reject" };
  if (!handoff_id || !["accept", "reject"].includes(action ?? "")) {
    return NextResponse.json({ error: "handoff_id と action(accept|reject) が必要です" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: handoff } = await admin
    .from("event_agent_handoffs")
    .select("handoff_id, event_id, from_agent_id, to_agent_id, status")
    .eq("handoff_id", handoff_id)
    .eq("event_id", eventId)
    .single();

  if (!handoff) return NextResponse.json({ error: "Handoff not found" }, { status: 404 });

  if (handoff.to_agent_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (handoff.status !== "pending") {
    return NextResponse.json({ error: "既に回答済みの依頼です" }, { status: 400 });
  }

  const accepted = action === "accept";

  const { error: updateHandoffError } = await admin
    .from("event_agent_handoffs")
    .update({ status: accepted ? "accepted" : "rejected", responded_at: new Date().toISOString() })
    .eq("handoff_id", handoff_id);

  if (updateHandoffError) {
    return NextResponse.json({ error: updateHandoffError.message }, { status: 500 });
  }

  let eventDetail: { title: string; organizer_profile_id: string } | null = null;

  if (accepted) {
    const { data, error } = await admin
      .from("events")
      .update({ agent_id: user.id })
      .eq("event_id", eventId)
      .select("title, organizer_profile_id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    eventDetail = data;
  } else {
    const { data } = await admin
      .from("events")
      .select("title, organizer_profile_id")
      .eq("event_id", eventId)
      .single();
    eventDetail = data;
  }

  try {
    const { data: toAgentProfile } = await admin
      .from("profiles")
      .select("display_name, organizer_name")
      .eq("profile_id", user.id)
      .single();
    const toAgentName = toAgentProfile?.organizer_name ?? toAgentProfile?.display_name ?? "エージェント";

    await admin.from("notifications").insert({
      profile_id: handoff.from_agent_id,
      type: "handoff_response",
      title: accepted ? "代打依頼が承諾されました" : "代打依頼が却下されました",
      body: accepted
        ? `${toAgentName} さんが「${eventDetail?.title}」の代打を承諾し、担当が引き継がれました。`
        : `${toAgentName} さんが「${eventDetail?.title}」の代打を却下しました。`,
      metadata: { event_id: eventId, handoff_id },
    });

    const { data: fromAuthUser } = await admin.auth.admin.getUserById(handoff.from_agent_id);
    const fromEmail = fromAuthUser.user?.email;
    if (fromEmail && eventDetail) {
      sendHandoffResponseEmail({
        to: fromEmail,
        eventId,
        eventTitle: eventDetail.title,
        toAgentName,
        accepted,
      }).catch(() => {});
    }

    if (accepted && eventDetail) {
      await admin.from("notifications").insert({
        profile_id: eventDetail.organizer_profile_id,
        type: "handoff_response",
        title: "イベントの担当エージェントが変更されました",
        body: `「${eventDetail.title}」の担当が ${toAgentName} さんに引き継がれました。`,
        metadata: { event_id: eventId, handoff_id },
      });
    }
  } catch { /* 通知失敗はサイレントに */ }

  return NextResponse.json({ success: true });
}

// 依頼元エージェントが自分の依頼を取り消し
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { handoff_id } = await req.json() as { handoff_id?: string };
  if (!handoff_id) return NextResponse.json({ error: "handoff_id is required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: handoff } = await admin
    .from("event_agent_handoffs")
    .select("handoff_id, from_agent_id, status")
    .eq("handoff_id", handoff_id)
    .eq("event_id", eventId)
    .single();

  if (!handoff) return NextResponse.json({ error: "Handoff not found" }, { status: 404 });

  if (handoff.from_agent_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (handoff.status !== "pending") {
    return NextResponse.json({ error: "既に回答済みの依頼です" }, { status: 400 });
  }

  const { error } = await admin
    .from("event_agent_handoffs")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("handoff_id", handoff_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
