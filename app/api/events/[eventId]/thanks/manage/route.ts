import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET: 編集者向け（下書き含む全データを返す）
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
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

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // アクセス権チェック
  if (profile.role === "admin") {
    // OK
  } else if (profile.role === "organizer") {
    const { data: event } = await admin
      .from("events")
      .select("organizer_profile_id")
      .eq("event_id", eventId)
      .single();
    if (event?.organizer_profile_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (profile.role === "artist") {
    const { data: ea } = await admin
      .from("event_artists")
      .select("artist_profile_id")
      .eq("event_id", eventId)
      .eq("artist_profile_id", user.id)
      .maybeSingle();
    if (!ea) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: thanks } = await admin
    .from("event_thanks")
    .select("thanks_message, thanks_link_url, thanks_media_url, published_at")
    .eq("event_id", eventId)
    .maybeSingle();

  return NextResponse.json({ thanks: thanks ?? null });
}
