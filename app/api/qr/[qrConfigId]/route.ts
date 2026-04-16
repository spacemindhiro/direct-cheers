import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getQRWithPermission(qrConfigId: string, userId: string) {
  const supabase = await createClient();

  const { data: qr } = await supabase
    .from("qr_configs")
    .select("qr_config_id, event_id, creator_profile_id, deleted_at")
    .eq("qr_config_id", qrConfigId)
    .is("deleted_at", null)
    .single();

  if (!qr) return { qr: null, supabase, error: "Not found" };

  const { data: event } = await supabase
    .from("events")
    .select("organizer_profile_id, agent_id")
    .eq("event_id", qr.event_id)
    .single();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", userId)
    .single();

  const isOrganizer = event?.organizer_profile_id === userId;
  const isAgent =
    (profile?.role === "agent" || profile?.role === "admin") &&
    event?.agent_id === userId;

  if (!isOrganizer && !isAgent) return { qr: null, supabase, error: "Forbidden" };

  return { qr, supabase, error: null };
}

// ラベル更新
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> },
) {
  const { qrConfigId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { qr, supabase: sb, error } = await getQRWithPermission(qrConfigId, user.id);
  if (!qr) return NextResponse.json({ error }, { status: error === "Forbidden" ? 403 : 404 });

  const { label } = await req.json() as { label?: string };
  const { error: updateError } = await sb
    .from("qr_configs")
    .update({ label: label ?? null })
    .eq("qr_config_id", qrConfigId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// 論理削除
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> },
) {
  const { qrConfigId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { qr, supabase: sb, error } = await getQRWithPermission(qrConfigId, user.id);
  if (!qr) return NextResponse.json({ error }, { status: error === "Forbidden" ? 403 : 404 });

  const { error: deleteError } = await sb
    .from("qr_configs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("qr_config_id", qrConfigId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
