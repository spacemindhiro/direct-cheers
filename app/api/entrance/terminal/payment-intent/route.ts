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

  const { product_id, quantity: rawQuantity, device_name, target_device_id } = await req.json() as {
    product_id: string;
    quantity?: number;
    device_name?: string;
    target_device_id?: string;
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
    .select("product_id, min_amount, max_amount, event_id, type, payment_type, quantity_selectable")
    .eq("product_id", product_id)
    .is("deleted_at", null)
    .single();

  // 対面タッチ決済の対象はentrance×Cタイプ、custom×バウチャー(V)×金額固定、
  // またはcustom×ドリンクチケット(D)×杯数指定オフ（常に数量1固定、まとめ買い割引の
  // 適用余地が無い商品）のみ
  const productEligible = !!product && (
    (product.type === "entrance" && product.payment_type === "C") ||
    (product.type === "custom" && product.payment_type === "V" && product.min_amount === product.max_amount) ||
    (product.type === "custom" && product.payment_type === "D" && product.quantity_selectable === false)
  );
  if (!productEligible) {
    return NextResponse.json({ error: "対面タッチ決済に対応していない商品です" }, { status: 400 });
  }

  const { data: qrc } = await admin
    .from("qr_configs")
    .select("qr_config_id, touchpay_enabled, event:events!event_id(organizer_profile_id, agent_id, venue)")
    .eq("product_id", product_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!qrc?.touchpay_enabled) {
    return NextResponse.json({ error: "この商品は対面タッチ決済が許可されていません" }, { status: 400 });
  }

  // サインアップQRを表示すべき子機を1台に絞るため必須。ペアリングされていない
  // 端末からの決済は受け付けない（全子機に出てしまうのを防ぐ）。
  if (!target_device_id) {
    return NextResponse.json({ error: "表示する子機が設定されていません。子機とのペアリングを行ってください" }, { status: 400 });
  }
  const { data: pairedDevice } = await admin
    .from("display_devices")
    .select("device_id")
    .eq("event_id", product.event_id)
    .eq("device_id", target_device_id)
    .maybeSingle();
  if (!pairedDevice) {
    return NextResponse.json({ error: "ペアリングされた子機が見つかりません。子機の再ペアリングを行ってください" }, { status: 400 });
  }

  const eventRow = qrc?.event as unknown as { organizer_profile_id: string | null; agent_id: string | null; venue: string | null } | null;

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
      event_venue: eventRow?.venue ?? "",
      quantity: String(quantity),
      device_name: device_name ?? "",
      target_device_id,
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
