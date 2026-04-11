import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await supabase
    .from("events")
    .select("event_id, organizer_profile_id, end_at, lifecycle_status")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.organizer_profile_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (new Date(event.end_at) > new Date())
    return NextResponse.json({ error: "Event has not ended yet" }, { status: 400 });

  const { description, photo_paths, attendance_count } = await req.json() as {
    description?: string;
    photo_paths: string[];
    attendance_count?: number;
  };

  const { data, error } = await supabase
    .from("event_evidences")
    .insert({
      event_id: eventId,
      submitted_by: user.id,
      description: description ?? null,
      photo_paths: photo_paths ?? [],
      attendance_count: attendance_count ?? null,
    })
    .select("evidence_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ evidence_id: data.evidence_id });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("event_evidences")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ evidences: data ?? [] });
}
