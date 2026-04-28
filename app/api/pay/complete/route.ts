import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPurchaseReceipt } from "@/lib/email/purchase-receipt";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const { session_id } = await req.json() as { session_id: string };

  if (!session_id) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["customer"],
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  if (session.payment_status !== "paid") {
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
    return buildResponse(email, existing, product, qrcInfo, isMember, hasPasskey);
  }

  // provisional_users に email を upsert
  let provisionalProfileId: string | null = null;
  if (email) {
    const { data: provisional } = await admin
      .from("provisional_users")
      .upsert({ email, stripe_customer_id: stripeCustomerId }, { onConflict: "email" })
      .select("provisional_id, profile_id")
      .single();
    provisionalProfileId = provisional?.profile_id ?? null;
  }

  const productId = meta.product_id || null;
  const qrConfigId = meta.qr_config_id || null;

  const { data: tx, error: txError } = await admin
    .from("transactions")
    .insert({
      stripe_payment_intent_id: session.payment_intent as string,
      product_id: productId,
      qr_config_id: qrConfigId,
      sender_profile_id: provisionalProfileId,
      status: "completed",
      sender_email: email ?? null,
      total_gross_amount: session.amount_total ?? 0,
      stripe_funds_status: "held_in_platform",
      amount_verified: session.amount_total !== null,
      amount_mismatch: 0,
    })
    .select("transaction_id")
    .single();

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  const [qrcInfo, isMember, hasPasskey] = await Promise.all([
    getQrConfigInfo(admin, qrConfigId),
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
        p_transaction_id: tx.transaction_id,
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

  const response = buildResponse(
    email,
    {
      transaction_id: tx.transaction_id,
      product_id: productId,
      total_gross_amount: session.amount_total ?? 0,
      sequence_number_in_event: serialNumber,
      qr_config_id: qrConfigId,
    },
    product,
    qrcInfo,
    isMember,
    hasPasskey,
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
      transactionId: tx.transaction_id,
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
  const { data: prov } = await admin
    .from("provisional_users")
    .select("profile_id")
    .eq("email", email)
    .maybeSingle();
  if (!prov?.profile_id) return false;
  const { count } = await admin
    .from("passkey_credentials")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", prov.profile_id);
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
): NextResponse {
  return NextResponse.json({
    transaction_id: tx.transaction_id,
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
