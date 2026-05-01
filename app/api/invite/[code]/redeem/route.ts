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
    .select("code_id, qr_config_id, event_id, expires_at, max_uses")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "無効な招待コードです" }, { status: 404 });

  const { data: qrConfig } = await admin
    .from("qr_configs")
    .select("product_id")
    .eq("qr_config_id", invite.qr_config_id)
    .single();

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "この招待コードは期限切れです" }, { status: 410 });
  }

  // 使用数チェック（定員）
  const maxUses = invite.max_uses ?? 1;
  const { count: usedCount } = await admin
    .from("transactions")
    .select("transaction_id", { count: "exact", head: true })
    .eq("invitation_code_id", invite.code_id);

  if ((usedCount ?? 0) >= maxUses) {
    return NextResponse.json({ error: "この招待の定員に達しました" }, { status: 410 });
  }

  // 同じイベントの招待をすでに受け取っていないか確認
  const { data: alreadyUsed } = await admin
    .from("transactions")
    .select("transaction_id")
    .eq("sender_profile_id", user.id)
    .eq("transaction_type", "invitation")
    .in("qr_config_id", [invite.qr_config_id])
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
      invitation_code_id: invite.code_id,
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

  if (qrConfig?.product_id) {
    await admin.from("tickets").insert({
      transaction_id: tx.transaction_id,
      product_id: qrConfig.product_id,
      event_id: invite.event_id,
      email: user.email ?? "",
      holder_profile_id: user.id,
    });
  }

  return NextResponse.json({ ok: true, transaction_id: tx.transaction_id });
}
