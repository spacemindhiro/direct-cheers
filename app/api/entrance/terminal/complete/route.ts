import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeeConfig } from "@/lib/fee-config";
import { broadcastCheerNew, broadcastTouchpaySignup } from "@/lib/realtime-broadcast";

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
  // stripe_pi_sequence=0 は1階（アンカー行）。ウェルカムチアの2階行が同一PIに
  // 追加されても複数行ヒットしないよう、アンカー行だけを見る。
  const { data: existingTx } = await admin
    .from("transactions")
    .select("transaction_id")
    .eq("stripe_payment_intent_id", payment_intent_id)
    .eq("stripe_pi_sequence", 0)
    .maybeSingle();
  if (existingTx) {
    const { data: existingTicket } = await admin
      .from("tickets")
      .select("ticket_id, quantity, holder_profile_id")
      .eq("transaction_id", existingTx.transaction_id)
      .maybeSingle();
    if (existingTicket) {
      let customerName: string | null = null;
      if (existingTicket.holder_profile_id) {
        const { data: profileRow } = await admin
          .from("profiles")
          .select("display_name")
          .eq("profile_id", existingTicket.holder_profile_id)
          .single();
        customerName = profileRow?.display_name ?? null;
      }
      return NextResponse.json({
        ok: true,
        ticket_id: existingTicket.ticket_id,
        quantity: existingTicket.quantity,
        is_repeat: !!existingTicket.holder_profile_id,
        customer_name: customerName,
      });
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

  let agentId: string | null = null;
  const { data: eventRow } = await admin
    .from("events")
    .select("agent_id")
    .eq("event_id", eventId)
    .single();
  agentId = eventRow?.agent_id ?? null;

  // ウェルカムチア: 合計金額(1人あたり単価×quantity)のうち、welcome_cheer_amount×quantity分を
  // 2階（チア）として切り出す。1階は残りの取り分として既存のqr_config配分ロジックそのまま。
  const { data: product } = await admin
    .from("products")
    .select("welcome_cheer_amount, welcome_cheer_default_product_id")
    .eq("product_id", productId)
    .single();

  const welcomeCheerUnitAmount = product?.welcome_cheer_amount ?? null;
  const welcomeCheerTotal = welcomeCheerUnitAmount != null ? welcomeCheerUnitAmount * quantity : 0;
  const floor1Gross = gross - welcomeCheerTotal;

  const stripeFee = Math.ceil(floor1Gross * feeConfig.stripe_rate);
  const platformFee = Math.floor(floor1Gross * feeConfig.platform_rate);
  const agentFee = agentId ? Math.floor(platformFee * (feeConfig.agent_fee_rate / feeConfig.platform_rate)) : 0;

  // リピーター判定: 同じcard_fingerprintが既に実在アカウントへ紐付いたticketに
  // 使われていれば、その客だと分かっている（過去のサインアップで名寄せ済み）。
  let knownProfileId: string | null = null;
  let customerName: string | null = null;
  if (cardFingerprint) {
    const { data: existingLink } = await admin
      .from("tickets")
      .select("holder_profile_id")
      .eq("card_fingerprint", cardFingerprint)
      .not("holder_profile_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (existingLink?.holder_profile_id) {
      knownProfileId = existingLink.holder_profile_id;
      const { data: profileRow } = await admin
        .from("profiles")
        .select("display_name")
        .eq("profile_id", knownProfileId)
        .single();
      customerName = profileRow?.display_name ?? null;
    }
  }
  const isRepeat = knownProfileId !== null;

  const { data: rpcRows, error: rpcError } = await admin.rpc("complete_touchpay_payment", {
    p_stripe_payment_intent_id: payment_intent_id,
    p_product_id:               productId,
    p_qr_config_id:             qrConfigId,
    p_gross:                    floor1Gross,
    p_stripe_fee:               stripeFee,
    p_platform_fee:             platformFee,
    p_net_amount:               floor1Gross - stripeFee - platformFee,
    p_event_id:                 eventId,
    p_agent_id:                 agentId,
    p_agent_fee:                agentFee,
    p_device_name:              meta.device_name || null,
    p_card_fingerprint:         cardFingerprint,
    p_known_profile_id:         knownProfileId,
    p_stripe_pi_sequence:       0,
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
      .eq("stripe_pi_sequence", 0)
      .single();
    if (!tx) {
      return NextResponse.json({ error: "Transaction not found after RPC no-op" }, { status: 500 });
    }
    transactionId = tx.transaction_id;
  }

  // ウェルカムチア（2階）: welcome_cheer_amountが設定されている商品のみ、
  // 同一PIで2階transactionも作成する。デフォルト受取先（主催者ワンプライスチア）に
  // 一旦計上し、購入者が後で演者を選ぶまでは非表示のまま。
  if (isNewTransaction && welcomeCheerUnitAmount != null && product?.welcome_cheer_default_product_id) {
    const { data: wcQrConfig } = await admin
      .from("qr_configs")
      .select("qr_config_id")
      .eq("product_id", product.welcome_cheer_default_product_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (wcQrConfig?.qr_config_id) {
      const wcStripeFee = Math.ceil(welcomeCheerTotal * feeConfig.stripe_rate);
      const wcPlatformFee = Math.floor(welcomeCheerTotal * feeConfig.platform_rate);
      const wcAgentFee = agentId ? Math.floor(wcPlatformFee * (feeConfig.agent_fee_rate / feeConfig.platform_rate)) : 0;

      const { error: wcRpcError } = await admin.rpc("complete_touchpay_payment", {
        p_stripe_payment_intent_id: payment_intent_id,
        p_product_id:               product.welcome_cheer_default_product_id,
        p_qr_config_id:             wcQrConfig.qr_config_id,
        p_gross:                    welcomeCheerTotal,
        p_stripe_fee:               wcStripeFee,
        p_platform_fee:             wcPlatformFee,
        p_net_amount:               welcomeCheerTotal - wcStripeFee - wcPlatformFee,
        p_event_id:                 eventId,
        p_agent_id:                 agentId,
        p_agent_fee:                wcAgentFee,
        p_device_name:              meta.device_name || null,
        p_card_fingerprint:         cardFingerprint,
        p_known_profile_id:         knownProfileId,
        p_stripe_pi_sequence:       1,
      });

      if (wcRpcError) {
        console.error("[terminal/complete] ウェルカムチア2階transaction作成失敗:", wcRpcError.message);
      }
    } else {
      console.error(`[terminal/complete] ウェルカムチアのデフォルト受取先qr_configが見つかりません product_id=${product.welcome_cheer_default_product_id}`);
    }
  }

  // タッチ決済＝その場で入場確定のため、ticketは最初からstatus='used'で発行する
  const { data: ticket } = await admin
    .from("tickets")
    .insert({
      product_id: productId,
      event_id: eventId,
      email: null,
      holder_profile_id: knownProfileId,
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
    // リピーターは既にアカウントと紐付いているため、サインアップQRではなく
    // 既存の投げ銭演出（ハート等）で完了フィードバックのみ行う。
    if (isRepeat) {
      broadcastCheerNew(eventId, gross).catch(() => {});
    } else {
      broadcastTouchpaySignup(eventId, ticket.ticket_id, quantity, meta.target_device_id || null).catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    ticket_id: ticket?.ticket_id ?? null,
    quantity,
    is_repeat: isRepeat,
    customer_name: customerName,
  });
}
