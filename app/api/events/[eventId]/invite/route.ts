import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: event } = await admin
    .from("events")
    .select("event_id, organizer_profile_id, agent_id, end_at")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";
  const isOrganizer = event.organizer_profile_id === user.id;
  const isAgent = event.agent_id === user.id;

  if (!isAdmin && !isOrganizer && !isAgent) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { qr_config_id } = await req.json() as { qr_config_id: string };
  if (!qr_config_id) return NextResponse.json({ error: "qr_config_id は必須です" }, { status: 400 });

  const { data: qrConfig } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("qr_config_id", qr_config_id)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .single();

  if (!qrConfig) return NextResponse.json({ error: "QR config not found" }, { status: 404 });

  // コード生成（重複時はリトライ）
  let code = "";
  for (let i = 0; i < 5; i++) {
    const candidate = generateCode();
    const { data: exists } = await admin
      .from("invitation_codes")
      .select("code_id")
      .eq("code", candidate)
      .maybeSingle();
    if (!exists) { code = candidate; break; }
  }
  if (!code) return NextResponse.json({ error: "コード生成に失敗しました" }, { status: 500 });

  // イベント終了翌日を有効期限に
  const expiresAt = event.end_at
    ? new Date(new Date(event.end_at).getTime() + 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { error: insertErr } = await admin.from("invitation_codes").insert({
    code,
    qr_config_id,
    event_id: eventId,
    created_by: user.id,
    expires_at: expiresAt,
  });

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com";
  return NextResponse.json({ ok: true, code, url: `${siteUrl}/invite/${code}` });
}
