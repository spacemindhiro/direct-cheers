import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const { session_id } = await req.json() as { session_id: string };

  if (!session_id) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  // Stripe セッションを取得
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
    const product = await getProductInfo(admin, existing.product_id);
    // event_id を qr_config から取得
    let existingEventId: string | null = null;
    if (existing.qr_config_id) {
      const { data: qrc } = await admin.from("qr_configs").select("event_id").eq("qr_config_id", existing.qr_config_id).single();
      existingEventId = qrc?.event_id ?? null;
    }
    let existingQrImageUrl: string | null = null;
    if (existing.qr_config_id) {
      const { data: qrcImg } = await admin.from("qr_configs").select("image_url").eq("qr_config_id", existing.qr_config_id).single();
      existingQrImageUrl = qrcImg?.image_url ?? null;
    }
    return buildResponse(email, existing, product, existingEventId, existingQrImageUrl);
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

  const amountVerified = session.amount_total !== null;
  const amountMismatch = 0;

  // transaction を作成
  const productId = meta.product_id || null;
  const qrConfigId = meta.qr_config_id || null;

  const { data: tx, error: txError } = await admin
    .from("transactions")
    .insert({
      stripe_payment_intent_id: session.payment_intent as string,
      product_id: productId,
      qr_config_id: qrConfigId,
      sender_profile_id: provisionalProfileId,
      sender_name: meta.nickname || null,
      sender_comment: meta.comment || null,
      status: "completed",
      sender_email: email ?? null,
      total_gross_amount: session.amount_total ?? 0,
      stripe_funds_status: "held_in_platform",
      amount_verified: amountVerified,
      amount_mismatch: amountMismatch,
    })
    .select("transaction_id")
    .single();

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  // qr_config を取得（event_id / image_url）
  let newEventId: string | null = null;
  let newQrImageUrl: string | null = null;
  if (qrConfigId) {
    const { data: qrc } = await admin
      .from("qr_configs")
      .select("event_id, image_url")
      .eq("qr_config_id", qrConfigId)
      .single();
    newEventId = qrc?.event_id ?? null;
    newQrImageUrl = qrc?.image_url ?? null;
  }

  // シリアルナンバー採番
  let serialNumber: number | null = null;
  if (qrConfigId && newEventId) {
    try {
      // artist_id を取得（products → artist_id）
      let artistId: string | null = null;
      if (productId) {
        const { data: product } = await admin
          .from("products")
          .select("artist_id")
          .eq("product_id", productId)
          .single();
        artistId = product?.artist_id ?? null;
      }

      // RPC で排他制御付き採番
      const { data: seqData } = await admin.rpc("assign_serial_number", {
        p_transaction_id: tx.transaction_id,
        p_event_id: newEventId,
        p_artist_id: artistId,
        p_qr_config_id: qrConfigId,
      });

      serialNumber = seqData ?? null;
    } catch (err) {
      // 採番失敗はサイレントに（カード発行は継続）
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
    newEventId,
    newQrImageUrl
  );

  if (email) {
    (response as NextResponse).cookies.set("dc_ce", email, {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
  }

  return response;
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
  eventId: string | null = null,
  qrImageUrl: string | null = null
): NextResponse {
  return NextResponse.json({
    transaction_id: tx.transaction_id,
    email,
    amount: tx.total_gross_amount,
    serial_number: tx.sequence_number_in_event,
    event_id: eventId,
    qr_image_url: qrImageUrl,
    ...product,
  });
}

async function getProductInfo(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  productId: string | null
) {
  if (!productId) return { artist_id: null, artist_name: null, event_title: null, artist_avatar: null, product_name: null };
  const { data } = await admin
    .from("products")
    .select("name, artist_id, artist:profiles!artist_id(display_name, avatar_url), event:events!event_id(title)")
    .eq("product_id", productId)
    .single();
  return {
    artist_id: (data as any)?.artist_id ?? null,
    artist_name: (data?.artist as any)?.display_name ?? null,
    event_title: (data?.event as any)?.title ?? null,
    artist_avatar: (data?.artist as any)?.avatar_url ?? null,
    product_name: data?.name ?? null,
  };
}
