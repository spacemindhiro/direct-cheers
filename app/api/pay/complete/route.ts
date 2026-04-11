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
    .select("transaction_id, product_id, total_gross_amount")
    .eq("stripe_payment_intent_id", session.payment_intent as string)
    .maybeSingle();

  if (existing) {
    // 既に処理済み → そのまま返す
    const product = await getProductInfo(admin, existing.product_id);
    return NextResponse.json({
      transaction_id: existing.transaction_id,
      email,
      amount: existing.total_gross_amount,
      ...product,
    });
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

  // transaction を作成
  const productId = meta.product_id;
  const { data: tx, error: txError } = await admin
    .from("transactions")
    .insert({
      stripe_payment_intent_id: session.payment_intent as string,
      product_id: productId || null,
      qr_config_id: meta.qr_config_id || null,
      sender_profile_id: provisionalProfileId,
      sender_name: meta.nickname || null,
      sender_comment: meta.comment || null,
      status: "completed",
      total_gross_amount: session.amount_total ?? 0,
      stripe_funds_status: "held_in_platform",
    })
    .select("transaction_id")
    .single();

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  // メールを Cookie に保存するよう指示（レスポンスヘッダー）
  const product = await getProductInfo(admin, productId);
  const response = NextResponse.json({
    transaction_id: tx.transaction_id,
    email,
    amount: session.amount_total ?? 0,
    stripe_customer_id: stripeCustomerId,
    ...product,
  });

  if (email) {
    response.cookies.set("dc_ce", email, {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      httpOnly: false, // JS から読める
    });
  }

  return response;
}

async function getProductInfo(admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>, productId: string | null) {
  if (!productId) return { artist_name: null, event_title: null, artist_avatar: null };
  const { data } = await admin
    .from("products")
    .select("name, artist:profiles!artist_id(display_name, avatar_url), event:events!event_id(title)")
    .eq("product_id", productId)
    .single();
  return {
    artist_name: (data?.artist as any)?.display_name ?? null,
    event_title: (data?.event as any)?.title ?? null,
    artist_avatar: (data?.artist as any)?.avatar_url ?? null,
    product_name: data?.name ?? null,
  };
}
