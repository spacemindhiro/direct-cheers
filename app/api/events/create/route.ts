import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  if (profile?.role !== "organizer") {
    return NextResponse.json({ error: "Organizer only" }, { status: 403 });
  }
  if (profile?.status !== "active") {
    return NextResponse.json({ error: "Account not active" }, { status: 403 });
  }
  if (!profile?.responsible_agent_id) {
    return NextResponse.json({ error: "No agent assigned" }, { status: 400 });
  }

  const body = await req.json();
  const { title, venue, start_at, end_at, artist_ids, serial_scope } = body as {
    title: string;
    venue: string;
    start_at: string;
    end_at: string;
    artist_ids: string[];
    serial_scope?: "event" | "artist";
  };

  if (!title || !venue || !start_at || !end_at) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // イベント作成
  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      organizer_profile_id: user.id,
      agent_id: profile.responsible_agent_id,
      title,
      venue,
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

  // アーティスト登録
  if (artist_ids && artist_ids.length > 0) {
    const artistRows = artist_ids.map((artist_profile_id, i) => ({
      event_id: event.event_id,
      artist_profile_id,
      performance_order: i + 1,
    }));
    const { error: artistError } = await supabase
      .from("event_artists")
      .insert(artistRows);
    if (artistError) {
      return NextResponse.json({ error: artistError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ event_id: event.event_id });
}
