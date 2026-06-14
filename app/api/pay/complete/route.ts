import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPurchaseReceipt } from "@/lib/email/purchase-receipt";
import { getFeeConfig } from "@/lib/fee-config";
import { broadcastCheerNew } from "@/lib/realtime-broadcast";
import { resolveProfileIdByEmail } from "@/lib/resolve-profile";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);


export async function POST(req: Request) {
  const body = await req.json() as { session_id: string };
  const { session_id } = body;

  if (!session_id) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["customer", "payment_intent", "payment_intent.latest_charge"],
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  // manual capture の場合 payment_status は "unpaid" のままなので PaymentIntent で判定
  const pi = session.payment_intent as Stripe.PaymentIntent | null;
  const isAuthorized =
    session.payment_status === "paid" ||
    pi?.status === "requires_capture";

  if (!isAuthorized) {
    return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
  }

  const stripeEmail = session.customer_email ?? (session.customer as Stripe.Customer)?.email;
  const meta = session.metadata ?? {};
  // ログイン中ユーザーのメアドが metadata にあればそちらを優先（Link 別メアド決済対策）
  const email = meta.sender_email || stripeEmail;
  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : (session.customer as Stripe.Customer)?.id ?? null;

  const admin = createAdminClient();

  // profile_id をメールから1回だけ解決 — provisional_users 優先、auth.users フォールバック
  const senderProfileId = await resolveProfileIdByEmail(admin, email ?? null);

  // 既存 transaction チェック（冪等性）
  const { data: existing } = await admin
    .from("transactions")
    .select("transaction_id, product_id, total_gross_amount, sequence_number_in_event, qr_config_id")
    .eq("stripe_payment_intent_id", pi?.id ?? "")
    .maybeSingle();

  if (existing) {
    const [product, qrcInfo, hasPasskey] = await Promise.all([
      getProductInfo(admin, existing.product_id),
      getQrConfigInfo(admin, existing.qr_config_id ?? null),
      checkHasPasskey(admin, senderProfileId),
    ]);
    let existingTicketId: string | null = null;
    if (product.product_type === "entrance") {
      const { data: t } = await admin
        .from("tickets")
        .select("ticket_id")
        .eq("transaction_id", existing.transaction_id)
        .maybeSingle();
      existingTicketId = t?.ticket_id ?? null;
    }
    return buildResponse(email, existing, product, qrcInfo, !!senderProfileId, hasPasskey, existingTicketId);
  }

  const productId = meta.product_id || null;
  const qrConfigId = meta.qr_config_id || null;

  const gross = session.amount_total ?? 0;
  const paymentMethod = (session.payment_method_types?.[0] === "paypay") ? "paypay" : "card";
  const latestCharge = pi?.latest_charge as Stripe.Charge | null;
  const walletType = (latestCharge?.payment_method_details?.card?.wallet as any)?.type ?? null;
  const feeConfig = await getFeeConfig();
  const stripeFee = Math.floor(gross * (paymentMethod === "paypay" ? feeConfig.paypay_rate : feeConfig.stripe_rate));
  const platformFee = Math.floor(gross * feeConfig.platform_rate);

  // qrcInfo とエージェント情報を RPC 呼び出し前に取得（agent_fee 計算に必要）
  const qrcInfo = await getQrConfigInfo(admin, qrConfigId);

  let agentId: string | null = null;
  let agentFee = 0;
  if (qrcInfo.eventId) {
    const { data: eventRow } = await admin
      .from("events")
      .select("agent_id")
      .eq("event_id", qrcInfo.eventId)
      .single();
    agentId = eventRow?.agent_id ?? null;
    if (agentId) {
      agentFee = Math.floor(platformFee * (feeConfig.agent_fee_rate / feeConfig.platform_rate));
    }
  }

  // provisional_users + transactions + distributions をアトミックに書き込む
  const { data: rpcRows, error: rpcError } = await admin.rpc("complete_cheers_payment", {
    p_stripe_payment_intent_id: pi?.id ?? "",
    p_product_id:               productId,
    p_qr_config_id:             qrConfigId,
    p_email:                    email ?? null,
    p_stripe_customer_id:       stripeCustomerId,
    p_gross:                    gross,
    p_stripe_fee:               stripeFee,
    p_platform_fee:             platformFee,
    p_net_amount:               gross - stripeFee - platformFee,
    p_payment_method:           paymentMethod,
    p_sender_name:              meta.nickname || null,
    p_sender_comment:           meta.comment || null,
    p_event_id:                 qrcInfo.eventId ?? null,
    p_agent_id:                 agentId,
    p_agent_fee:                agentFee,
    p_wallet_type:              walletType,
    p_device_name:              meta.device_name || null,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  // RPC が ON CONFLICT でスキップした場合（webhook が先に書いた race）は既存行を取得
  let transactionId: string;
  const isNewTransaction = (rpcRows as any[]).length > 0;
  if (isNewTransaction) {
    transactionId = (rpcRows as any[])[0].out_transaction_id;
  } else {
    const { data: tx } = await admin
      .from("transactions")
      .select("transaction_id")
      .eq("stripe_payment_intent_id", pi?.id ?? "")
      .single();
    if (!tx) {
      return NextResponse.json({ error: "Transaction not found after RPC no-op" }, { status: 500 });
    }
    transactionId = tx.transaction_id;
  }

  const hasPasskey = await checkHasPasskey(admin, senderProfileId);

  // シリアルナンバー採番
  let serialNumber: number | null = null;
  if (qrConfigId && qrcInfo.eventId) {
    try {
      let artistId: string | null = null;
      if (productId) {
        const { data: product } = await admin
          .from("products")
          .select("artist_id")
          .eq("product_id", productId)
          .single();
        artistId = product?.artist_id ?? null;
      }
      const { data: seqData } = await admin.rpc("assign_serial_number", {
        p_transaction_id: transactionId,
        p_event_id: qrcInfo.eventId,
        p_artist_id: artistId,
        p_qr_config_id: qrConfigId,
      });
      serialNumber = seqData ?? null;
    } catch (err) {
      console.error("[pay/complete] serial number assignment failed:", err);
    }
  }

  const product = await getProductInfo(admin, productId);

  // エントランスタイプならチケット発行 — profile_id は冒頭で解決済み
  let ticketId: string | null = null;
  if (product.product_type === "entrance" && qrcInfo.eventId && productId) {
    const { data: t } = await admin
      .from("tickets")
      .insert({
        product_id: productId,
        event_id: qrcInfo.eventId,
        email: email ?? null,
        holder_profile_id: senderProfileId,
        transaction_id: transactionId,
        status: "valid",
      })
      .select("ticket_id")
      .single();
    ticketId = t?.ticket_id ?? null;
  }

  // QR子機画面へブロードキャスト（fire-and-forget）
  if (qrcInfo.eventId) {
    broadcastCheerNew(qrcInfo.eventId, gross).catch(() => {});
  }

  const response = buildResponse(
    email,
    {
      transaction_id: transactionId,
      product_id: productId,
      total_gross_amount: session.amount_total ?? 0,
      sequence_number_in_event: serialNumber,
      qr_config_id: qrConfigId,
    },
    product,
    qrcInfo,
    !!senderProfileId,
    hasPasskey,
    ticketId,
  );

  if (email) {
    (response as NextResponse).cookies.set("dc_ce", email, {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });

    // receipt_sent_at が NULL の行だけ UPDATE → 成功した側だけ送信（重複防止）
    const { data: claimed } = await admin
      .from("transactions")
      .update({ receipt_sent_at: new Date().toISOString() })
      .eq("transaction_id", transactionId)
      .is("receipt_sent_at", null)
      .select("transaction_id");
    if (claimed && claimed.length > 0) {
      sendPurchaseReceipt({
        to: email,
        amount: session.amount_total ?? 0,
        recipientName: qrcInfo.recipientName,
        eventTitle: product.event_title as string | null,
        transactionId: transactionId,
        productType: product.product_type as string | null,
        ticketId,
      }).catch((err) => console.error("[pay/complete] メール送信失敗:", err));
    }
  }

  return response;
}

type QrConfigInfo = {
  eventId: string | null;
  imageUrl: string | null;
  recipientName: string | null;
  recipientAvatar: string | null;
};


async function getQrConfigInfo(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  qrConfigId: string | null,
): Promise<QrConfigInfo> {
  if (!qrConfigId) return { eventId: null, imageUrl: null, recipientName: null, recipientAvatar: null };

  const { data: qrc } = await admin
    .from("qr_configs")
    .select("event_id, image_url, recipient:profiles!recipient_profile_id(display_name, avatar_url)")
    .eq("qr_config_id", qrConfigId)
    .single();

  return {
    eventId: qrc?.event_id ?? null,
    imageUrl: qrc?.image_url ?? null,
    recipientName: (qrc?.recipient as any)?.display_name ?? null,
    recipientAvatar: (qrc?.recipient as any)?.avatar_url ?? null,
  };
}

// profile_id を受け取り passkey_credentials だけ確認
async function checkHasPasskey(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  profileId: string | null,
): Promise<boolean> {
  if (!profileId) return false;
  const { count } = await admin
    .from("passkey_credentials")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", profileId);
  return (count ?? 0) > 0;
}

function buildResponse(
  email: string | null | undefined,
  tx: {
    transaction_id: string;
    product_id: string | null;
    total_gross_amount: number;
    sequence_number_in_event: number | null;
    qr_config_id?: string | null;
  },
  product: Record<string, unknown>,
  qrcInfo: QrConfigInfo,
  isMember: boolean,
  hasPasskey: boolean = false,
  ticketId: string | null = null,
): NextResponse {
  return NextResponse.json({
    transaction_id: tx.transaction_id,
    ticket_id: ticketId,
    email,
    amount: tx.total_gross_amount,
    serial_number: tx.sequence_number_in_event,
    event_id: qrcInfo.eventId,
    qr_image_url: qrcInfo.imageUrl,
    recipient_name: qrcInfo.recipientName,
    recipient_avatar: qrcInfo.recipientAvatar,
    is_member: isMember,
    has_passkey: hasPasskey,
    ...product,
  });
}

async function getProductInfo(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  productId: string | null
) {
  if (!productId) return { artist_id: null, artist_name: null, event_title: null, artist_avatar: null, product_name: null, product_type: null };
  const { data } = await admin
    .from("products")
    .select("name, type, artist_id, artist:profiles!artist_id(display_name, avatar_url), event:events!event_id(title)")
    .eq("product_id", productId)
    .single();
  return {
    artist_id: (data as any)?.artist_id ?? null,
    artist_name: (data?.artist as any)?.display_name ?? null,
    event_title: (data?.event as any)?.title ?? null,
    artist_avatar: (data?.artist as any)?.avatar_url ?? null,
    product_name: data?.name ?? null,
    product_type: data?.type ?? null,
  };
}
