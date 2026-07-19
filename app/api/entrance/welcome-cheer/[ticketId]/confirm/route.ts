import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/entrance/welcome-cheer/[ticketId]/confirm
// body: { product_id: string }
//
// 購入者がウェルカムチア（2階）の宛先演者を確定する。一度確定したら変更不可。
// 選べるのは、このイベントのワンプライスかつ2階金額と完全一致するチア商品のみ。
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await params;
  const { product_id } = await req.json() as { product_id?: string };
  if (!product_id) {
    return NextResponse.json({ error: "Missing product_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: ticket } = await admin
    .from("tickets")
    .select("ticket_id, transaction_id, event_id")
    .eq("ticket_id", ticketId)
    .maybeSingle();
  if (!ticket || !ticket.transaction_id) {
    return NextResponse.json({ error: "TICKET_NOT_FOUND" }, { status: 404 });
  }

  const { data: floor1Tx } = await admin
    .from("transactions")
    .select("stripe_payment_intent_id, product_id")
    .eq("transaction_id", ticket.transaction_id)
    .maybeSingle();
  if (!floor1Tx?.stripe_payment_intent_id) {
    return NextResponse.json({ error: "WELCOME_CHEER_NOT_FOUND" }, { status: 404 });
  }

  const { data: floor2Tx } = await admin
    .from("transactions")
    .select("transaction_id, total_gross_amount")
    .eq("stripe_payment_intent_id", floor1Tx.stripe_payment_intent_id)
    .eq("stripe_pi_sequence", 1)
    .maybeSingle();
  if (!floor2Tx) {
    return NextResponse.json({ error: "WELCOME_CHEER_NOT_FOUND" }, { status: 404 });
  }

  // 選択商品の検証: エントランスQR作成時に主催者が明示的に候補登録した
  // チア商品であること（welcome_cheer_eligible_products）。
  const { data: eligible } = await admin
    .from("welcome_cheer_eligible_products")
    .select("cheer_product_id")
    .eq("entrance_product_id", floor1Tx.product_id)
    .eq("cheer_product_id", product_id)
    .maybeSingle();

  if (!eligible) {
    return NextResponse.json({ error: "この商品はウェルカムチアの宛先として選択できません" }, { status: 400 });
  }

  const { data: targetQrConfig } = await admin
    .from("qr_configs")
    .select("qr_config_id")
    .eq("product_id", product_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!targetQrConfig) {
    return NextResponse.json({ error: "この商品に対応するQR設定が見つかりません" }, { status: 400 });
  }

  const { data: rpcRows, error: rpcError } = await admin.rpc("confirm_welcome_cheer_recipient", {
    p_transaction_id:      floor2Tx.transaction_id,
    p_target_product_id:   product_id,
    p_target_qr_config_id: targetQrConfig.qr_config_id,
    p_event_id:            ticket.event_id,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const result = (rpcRows as { out_ok: boolean; out_error: string | null }[])[0];
  if (!result?.out_ok) {
    const status = result?.out_error === "ALREADY_LOCKED" ? 409 : 400;
    return NextResponse.json({ error: result?.out_error ?? "CONFIRM_FAILED" }, { status });
  }

  return NextResponse.json({ ok: true });
}
