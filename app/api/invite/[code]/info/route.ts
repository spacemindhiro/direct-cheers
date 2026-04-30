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
      code_id, expires_at, max_uses,
      event:events!event_id(title, start_at, end_at)
    `)
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "無効な招待コードです" }, { status: 404 });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "この招待コードは期限切れです" }, { status: 410 });
  }

  // 使用数チェック
  const maxUses = invite.max_uses ?? 1;
  const { count: usedCount } = await admin
    .from("transactions")
    .select("transaction_id", { count: "exact", head: true })
    .eq("invitation_code_id", invite.code_id);

  if ((usedCount ?? 0) >= maxUses) {
    return NextResponse.json({ error: "この招待の定員に達しました" }, { status: 410 });
  }

  return NextResponse.json({
    event: invite.event,
    max_uses: maxUses,
    used_count: usedCount ?? 0,
  });
}
