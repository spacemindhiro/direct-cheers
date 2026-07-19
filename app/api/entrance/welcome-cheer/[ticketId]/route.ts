import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/entrance/welcome-cheer/[ticketId]
//
// エントランスチケット（ticket_id）に紐づくウェルカムチア（2階transaction）の
// 状態と、選択可能な演者候補（ワンプライスかつ金額完全一致のチア商品）を返す。
// ticket_id自体が推測不可能なUUIDのため、これを知っていることを認可とする
// （wallet/pass等、本アプリの他エンドポイントと同じ方針）。
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await params;
  const admin = createAdminClient();

  const { data: ticket } = await admin
    .from("tickets")
    .select("ticket_id, transaction_id, event_id")
    .eq("ticket_id", ticketId)
    .maybeSingle();

  if (!ticket || !ticket.transaction_id) {
    return NextResponse.json({ has_welcome_cheer: false });
  }

  const { data: floor1Tx } = await admin
    .from("transactions")
    .select("stripe_payment_intent_id")
    .eq("transaction_id", ticket.transaction_id)
    .maybeSingle();

  if (!floor1Tx?.stripe_payment_intent_id) {
    return NextResponse.json({ has_welcome_cheer: false });
  }

  const { data: floor2Tx } = await admin
    .from("transactions")
    .select("transaction_id, total_gross_amount, welcome_cheer_locked_at, product:products!product_id(name, artist:profiles!artist_id(display_name))")
    .eq("stripe_payment_intent_id", floor1Tx.stripe_payment_intent_id)
    .eq("stripe_pi_sequence", 1)
    .maybeSingle();

  if (!floor2Tx) {
    return NextResponse.json({ has_welcome_cheer: false });
  }

  const currentProduct = floor2Tx.product as any;

  // 候補: このイベントの、ワンプライスかつ金額が2階金額と完全一致するstandardチア商品
  const { data: candidateProducts } = await admin
    .from("products")
    .select("product_id, name, artist_id, artist:profiles!artist_id(display_name, avatar_url)")
    .eq("event_id", ticket.event_id)
    .eq("type", "standard")
    .eq("min_amount", floor2Tx.total_gross_amount)
    .eq("max_amount", floor2Tx.total_gross_amount)
    .is("deleted_at", null);

  const candidates = (candidateProducts ?? []).map((p: any) => ({
    product_id: p.product_id,
    name: p.name,
    artist_name: p.artist?.display_name ?? null,
    artist_avatar: p.artist?.avatar_url ?? null,
  }));

  return NextResponse.json({
    has_welcome_cheer: true,
    transaction_id: floor2Tx.transaction_id,
    amount: floor2Tx.total_gross_amount,
    locked: floor2Tx.welcome_cheer_locked_at != null,
    current_recipient_name: currentProduct?.artist?.display_name ?? null,
    current_product_name: currentProduct?.name ?? null,
    candidates,
  });
}
