import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("invitation_codes")
    .select(`
      code_id, used_at, expires_at,
      event:events!event_id(title, start_at, end_at)
    `)
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "無効な招待コードです" }, { status: 404 });
  if (invite.used_at) return NextResponse.json({ error: "この招待コードはすでに使用済みです" }, { status: 410 });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "この招待コードは期限切れです" }, { status: 410 });
  }

  return NextResponse.json({ event: invite.event });
}
