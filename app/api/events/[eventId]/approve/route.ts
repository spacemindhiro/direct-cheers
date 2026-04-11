import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    .select("event_id, agent_id, lifecycle_status")
    .eq("event_id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (profile?.role === "agent" && event.agent_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (event.lifecycle_status !== "draft") {
    return NextResponse.json({ error: "Event is not in draft status" }, { status: 400 });
  }

  const { error } = await supabase
    .from("events")
    .update({ lifecycle_status: "published" })
    .eq("event_id", eventId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
