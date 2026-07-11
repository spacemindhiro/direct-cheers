import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkConnectCapabilities } from "@/lib/stripe-check";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// POST /api/entrance/terminal/payment-intent
// スタッフが商品・人数を選択した直後に、card_present（Terminal）のPaymentIntentを
// オーソリのみ（capture_method: manual）で作成する。他の決済経路と同じく、
// 開催承認（settle）まで資金を確定させないことがこのプラットフォームのマネロン対策の
// 核心原則のため、対面タッチ決済でも例外を作らない。
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

  const { product_id, quantity: rawQuantity, device_name } = await req.json() as {
    product_id: string;
    quantity?: number;
    device_name?: string;
  };

  if (!product_id) {
    return NextResponse.json({ error: "Missing product_id" }, { status: 400 });
  }
  const quantity = rawQuantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: product } = await admin
    .from("products")
    .select("product_id, min_amount, event_id, type, payment_type")
    .eq("product_id", product_id)
    .is("deleted_at", null)
    .single();

  if (!product || product.type !== "entrance" || product.payment_type !== "C") {
    return NextResponse.json({ error: "対面タッチ決済に対応していない商品です" }, { status: 400 });
  }

  const { data: qrc } = await admin
    .from("qr_configs")
    .select("qr_config_id, event:events!event_id(organizer_profile_id, agent_id)")
    .eq("product_id", product_id)
    .is("deleted_at", null)
    .maybeSingle();

  const eventRow = qrc?.event as unknown as { organizer_profile_id: string | null; agent_id: string | null } | null;

  let organizerConnectId: string | null = null;
  if (eventRow?.organizer_profile_id) {
    const { data: orgProfile } = await admin
      .from("profiles")
      .select("stripe_connect_id")
      .eq("profile_id", eventRow.organizer_profile_id)
      .single();
    organizerConnectId = orgProfile?.stripe_connect_id ?? null;
  }

  if (organizerConnectId) {
    const { ok, missing } = await checkConnectCapabilities(stripe, organizerConnectId);
    if (!ok) {
      return NextResponse.json(
        { error: "account_incomplete", missing_capabilities: missing },
        { status: 422 },
      );
    }
  }

  const amount = product.min_amount * quantity;

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "jpy",
    payment_method_types: ["card_present"],
    capture_method: "manual",
    ...(organizerConnectId ? { on_behalf_of: organizerConnectId } : {}),
    metadata: {
      product_id,
      qr_config_id: qrc?.qr_config_id ?? "",
      event_id: product.event_id,
      quantity: String(quantity),
      device_name: device_name ?? "",
      staff_profile_id: user.id,
    },
  });

  return NextResponse.json({
    client_secret: paymentIntent.client_secret,
    payment_intent_id: paymentIntent.id,
    amount,
    quantity,
  });
}
