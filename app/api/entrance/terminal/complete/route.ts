import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeeConfig } from "@/lib/fee-config";
import { broadcastTouchpaySignup } from "@/lib/realtime-broadcast";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// POST /api/entrance/terminal/complete
// Terminal決済（オーソリ）成功後に呼ばれる。transactions/tickets をアトミックに作成し、
// ticketは最初からstatus='used'（その場で入場確定）。子機へサインアップ用QR表示を指示する。
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  if (!["organizer", "admin", "agent"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { payment_intent_id } = await req.json() as { payment_intent_id: string };
  if (!payment_intent_id) {
    return NextResponse.json({ error: "Missing payment_intent_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 冪等性チェック（同じPIで既にticketが作られていないか）
  const { data: existingTx } = await admin
    .from("transactions")
    .select("transaction_id")
    .eq("stripe_payment_intent_id", payment_intent_id)
    .maybeSingle();
  if (existingTx) {
    const { data: existingTicket } = await admin
      .from("tickets")
      .select("ticket_id, quantity")
      .eq("transaction_id", existingTx.transaction_id)
      .maybeSingle();
    if (existingTicket) {
      return NextResponse.json({ ok: true, ticket_id: existingTicket.ticket_id, quantity: existingTicket.quantity });
    }
  }

  const pi = await stripe.paymentIntents.retrieve(payment_intent_id, { expand: ["latest_charge"] });
  if (pi.status !== "requires_capture") {
    return NextResponse.json({ error: `Unexpected PaymentIntent status: ${pi.status}` }, { status: 400 });
  }

  const charge = pi.latest_charge as Stripe.Charge | null;
  const cardFingerprint = charge?.payment_method_details?.card_present?.fingerprint ?? null;

  const meta = pi.metadata ?? {};
  const productId = meta.product_id || null;
  const qrConfigId = meta.qr_config_id || null;
  const eventId = meta.event_id || null;
  const quantity = Number.isInteger(parseInt(meta.quantity ?? "", 10)) ? parseInt(meta.quantity, 10) : 1;

  if (!productId || !eventId) {
    return NextResponse.json({ error: "Missing metadata on PaymentIntent" }, { status: 400 });
  }

  const gross = pi.amount;
  const feeConfig = await getFeeConfig();
  const stripeFee = Math.ceil(gross * feeConfig.stripe_rate);
  const platformFee = Math.floor(gross * feeConfig.platform_rate);

  let agentId: string | null = null;
  let agentFee = 0;
  const { data: eventRow } = await admin
    .from("events")
    .select("agent_id")
    .eq("event_id", eventId)
    .single();
  agentId = eventRow?.agent_id ?? null;
  if (agentId) {
    agentFee = Math.floor(platformFee * (feeConfig.agent_fee_rate / feeConfig.platform_rate));
  }

  const { data: rpcRows, error: rpcError } = await admin.rpc("complete_touchpay_payment", {
    p_stripe_payment_intent_id: payment_intent_id,
    p_product_id:               productId,
    p_qr_config_id:             qrConfigId,
    p_gross:                    gross,
    p_stripe_fee:               stripeFee,
    p_platform_fee:             platformFee,
    p_net_amount:               gross - stripeFee - platformFee,
    p_event_id:                 eventId,
    p_agent_id:                 agentId,
    p_agent_fee:                agentFee,
    p_device_name:              meta.device_name || null,
    p_card_fingerprint:         cardFingerprint,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  let transactionId: string;
  const isNewTransaction = (rpcRows as { out_transaction_id: string }[]).length > 0;
  if (isNewTransaction) {
    transactionId = rpcRows![0].out_transaction_id;
  } else {
    const { data: tx } = await admin
      .from("transactions")
      .select("transaction_id")
      .eq("stripe_payment_intent_id", payment_intent_id)
      .single();
    if (!tx) {
      return NextResponse.json({ error: "Transaction not found after RPC no-op" }, { status: 500 });
    }
    transactionId = tx.transaction_id;
  }

  // タッチ決済＝その場で入場確定のため、ticketは最初からstatus='used'で発行する
  const { data: ticket } = await admin
    .from("tickets")
    .insert({
      product_id: productId,
      event_id: eventId,
      email: null,
      holder_profile_id: null,
      transaction_id: transactionId,
      status: "used",
      checked_in_at: new Date().toISOString(),
      checked_in_by: user.id,
      quantity,
      card_fingerprint: cardFingerprint,
    })
    .select("ticket_id")
    .single();

  if (ticket) {
    broadcastTouchpaySignup(eventId, ticket.ticket_id, quantity).catch(() => {});
  }

  return NextResponse.json({ ok: true, ticket_id: ticket?.ticket_id ?? null, quantity });
}
