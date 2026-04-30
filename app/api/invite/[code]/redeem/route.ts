import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("invitation_codes")
    .select("code_id, qr_config_id, event_id, used_at, expires_at")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "無効な招待コードです" }, { status: 404 });
  if (invite.used_at) return NextResponse.json({ error: "この招待コードはすでに使用済みです" }, { status: 410 });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "この招待コードは期限切れです" }, { status: 410 });
  }

  // 同じコードをすでに引き換え済みか確認
  const { data: alreadyUsed } = await admin
    .from("invitation_codes")
    .select("code_id")
    .eq("used_by_profile_id", user.id)
    .eq("event_id", invite.event_id)
    .maybeSingle();

  if (alreadyUsed) return NextResponse.json({ error: "すでにこのイベントの招待を受け取っています" }, { status: 409 });

  // sequence番号
  const { count } = await admin
    .from("transactions")
    .select("transaction_id", { count: "exact", head: true })
    .eq("qr_config_id", invite.qr_config_id);

  // トランザクション作成
  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .insert({
      qr_config_id: invite.qr_config_id,
      sender_profile_id: user.id,
      sender_email: user.email,
      transaction_type: "invitation",
      total_gross_amount: 0,
      cumulative_amount_at_tx: 0,
      sequence_number_in_event: (count ?? 0) + 1,
      status: "completed",
      stripe_funds_status: "transferred",
    })
    .select("transaction_id")
    .single();

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  await admin
    .from("transactions")
    .update({ nft_serial_number: tx.transaction_id })
    .eq("transaction_id", tx.transaction_id);

  // コードを使用済みにマーク
  await admin
    .from("invitation_codes")
    .update({
      used_at: new Date().toISOString(),
      used_by_profile_id: user.id,
      transaction_id: tx.transaction_id,
    })
    .eq("code_id", invite.code_id);

  return NextResponse.json({ ok: true, transaction_id: tx.transaction_id });
}
