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

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (me?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: event } = await admin
    .from("events")
    .select("lifecycle_status")
    .eq("event_id", eventId)
    .single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.lifecycle_status !== "settled")
    return NextResponse.json({ error: "精算済みのイベントのみホールド解除できます" }, { status: 400 });

  const { count, error } = await admin
    .from("transaction_distributions")
    .update({ hold_released: true })
    .eq("event_id", eventId)
    .eq("distribution_status", "accrued")
    .eq("hold_released", false)
    .select("transaction_distribution_id", { count: "exact", head: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, released: count ?? 0 });
}
