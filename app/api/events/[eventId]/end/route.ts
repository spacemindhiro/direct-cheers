import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await admin
    .from("events")
    .select("organizer_profile_id, lifecycle_status")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.organizer_profile_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!["published", "ongoing"].includes(event.lifecycle_status))
    return NextResponse.json({ error: "Cannot end event in current status" }, { status: 400 });

  const { error } = await admin
    .from("events")
    .update({ lifecycle_status: "ended" })
    .eq("event_id", eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
