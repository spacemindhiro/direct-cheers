import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPurchaseReceipt } from "@/lib/email/purchase-receipt";
import { getFeeConfig } from "@/lib/fee-config";
import { broadcastCheerNew } from "@/lib/realtime-broadcast";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const { session_id } = await req.json() as { session_id: string };

  if (!session_id) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["customer", "payment_intent"],
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

  const email = session.customer_email ?? (session.customer as Stripe.Customer)?.email;
  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : (session.customer as Stripe.Customer)?.id ?? null;

  const meta = session.metadata ?? {};
  const admin = createAdminClient();

  // 既存 transaction チェック（冪等性）
  const { data: existing } = await admin
    .from("transactions")
    .select("transaction_id, product_id, total_gross_amount, sequence_number_in_event, qr_config_id")
    .eq("stripe_payment_intent_id", session.payment_intent as string)
    .maybeSingle();

  if (existing) {
    const [product, qrcInfo, isMember, hasPasskey] = await Promise.all([
      getProductInfo(admin, existing.product_id),
      getQrConfigInfo(admin, existing.qr_config_id ?? null),
      checkIsMember(admin, email ?? null),
      checkHasPasskey(admin, email ?? null),
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
    return buildResponse(email, existing, product, qrcInfo, isMember, hasPasskey, existingTicketId);
  }

  const productId = meta.product_id || null;
  const qrConfigId = meta.qr_config_id || null;

  const gross = session.amount_total ?? 0;
  const paymentMethod = (session.payment_method_types?.[0] === "paypay") ? "paypay" : "card";
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
    p_stripe_payment_intent_id: session.payment_intent as string,
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
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const transactionId: string = (rpcRows as any[])[0].out_transaction_id;

  const [isMember, hasPasskey] = await Promise.all([
    checkIsMember(admin, email ?? null),
    checkHasPasskey(admin, email ?? null),
  ]);

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

  // エントランスタイプならチケット発行
  let ticketId: string | null = null;
  if (product.product_type === "entrance" && qrcInfo.eventId && productId) {
    let holderProfileId: string | null = null;
    if (email) {
      const { data: pu } = await admin
        .from("provisional_users")
        .select("profile_id")
        .eq("email", email)
        .maybeSingle();
      holderProfileId = pu?.profile_id ?? null;
      if (!holderProfileId) {
        try {
          const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          holderProfileId = users.find((u) => u.email === email)?.id ?? null;
        } catch { /* ignore */ }
      }
    }
    const { data: t } = await admin
      .from("tickets")
      .insert({
        product_id: productId,
        event_id: qrcInfo.eventId,
        email: email ?? null,
        holder_profile_id: holderProfileId,
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
    isMember,
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
    .select("event_id, image_url, recipient_profile_id")
    .eq("qr_config_id", qrConfigId)
    .single();

  let recipientName: string | null = null;
  let recipientAvatar: string | null = null;
  if (qrc?.recipient_profile_id) {
    const { data: rp } = await admin
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("profile_id", qrc.recipient_profile_id)
      .single();
    recipientName = rp?.display_name ?? null;
    recipientAvatar = rp?.avatar_url ?? null;
  }

  return {
    eventId: qrc?.event_id ?? null,
    imageUrl: qrc?.image_url ?? null,
    recipientName,
    recipientAvatar,
  };
}

async function checkHasPasskey(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  email: string | null,
): Promise<boolean> {
  if (!email) return false;

  // provisional_users 経由で profile_id を取得
  const { data: prov } = await admin
    .from("provisional_users")
    .select("profile_id")
    .eq("email", email)
    .maybeSingle();

  const profileId = prov?.profile_id ?? null;

  // provisional に profile_id がない場合は auth users から直接解決
  let resolvedProfileId = profileId;
  if (!resolvedProfileId) {
    try {
      const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const authUser = users.find((u) => u.email === email);
      resolvedProfileId = authUser?.id ?? null;
    } catch {
      return false;
    }
  }

  if (!resolvedProfileId) return false;

  const { count } = await admin
    .from("passkey_credentials")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", resolvedProfileId);
  return (count ?? 0) > 0;
}

async function checkIsMember(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  email: string | null,
): Promise<boolean> {
  if (!email) return false;
  // provisional_users で profile_id が紐いていれば会員
  const { data: prov } = await admin
    .from("provisional_users")
    .select("profile_id")
    .eq("email", email)
    .maybeSingle();
  if (prov?.profile_id) return true;
  // それ以外は Supabase auth に存在するか確認（organizer 等のケース）
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    return data.users.some((u) => u.email === email);
  } catch {
    return false;
  }
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
