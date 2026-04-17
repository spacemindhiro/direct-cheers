import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET: 編集者向け（下書き含む全データ）
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> }
) {
  const { qrConfigId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: qr } = await admin
    .from("qr_configs")
    .select("event_id")
    .eq("qr_config_id", qrConfigId)
    .is("deleted_at", null)
    .single();

  if (!qr) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: event } = await admin
    .from("events")
    .select("organizer_profile_id, agent_id")
    .eq("event_id", qr.event_id)
    .single();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const isOrganizer = event?.organizer_profile_id === user.id;
  const isAgent =
    (profile?.role === "agent" || profile?.role === "admin") &&
    event?.agent_id === user.id;
  const isAdmin = profile?.role === "admin";

  if (!isOrganizer && !isAgent && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: thanks } = await admin
    .from("qr_config_thanks")
    .select("thanks_message, thanks_link_url, thanks_media_url, published_at")
    .eq("qr_config_id", qrConfigId)
    .maybeSingle();

  return NextResponse.json({ thanks: thanks ?? null });
}
