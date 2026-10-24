import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkConnectCapabilities } from "@/lib/stripe-check";
import { canOperateEvent } from "@/lib/event-operator";
import { SOLD_OUT_MESSAGE, TERMINAL_HOLD_TTL_SEC, holdStock, releaseStock } from "@/lib/stock-hold";
import { evaluatePurchaseWindow, purchaseWindowErrorMessage } from "@/lib/purchase-window";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// POST /api/entrance/terminal/payment-intent
// スタッフが商品・人数を選択した直後に、card_present（Terminal）のPaymentIntentを
// オーソリのみ（capture_method: manual）で作成する。開催中の打ち間違いはオーソリ取消（手数料なし）で
// 消せるようにするため。ただし Amex の対面オーソリは2日で切れ、開催承認を待つと回収できないことが
// あるので、締め時刻かオーソリから24時間の早い方で自動キャプチャする（app/api/cron/touchpay-capture）。
// キャプチャしても送金は開催承認（証跡確認）の後なので、お金が出ていく関門は変わらない（2026-10-22 決定）。
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

  // そのイベントの主催者・エージェント・管理者だけが、そのイベントの商品で決済を起こせる
  if (!(await canOperateEvent(admin, user.id, profile?.role, product.event_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: qrc } = await admin
    .from("qr_configs")
    .select("qr_config_id, touchpay_enabled, bypass_validity, sales_stopped_at, event:events!event_id(organizer_profile_id, agent_id, venue, lifecycle_status, start_at, end_at)")
    .eq("product_id", product_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!qrc?.touchpay_enabled) {
    return NextResponse.json({ error: "この商品は対面タッチ決済が許可されていません" }, { status: 400 });
  }

  // QR自己決済と同じ関数で、イベント状態（下書き・承認待ち・中止・精算済みは不可）と受付期間
  // （開始〜締め時刻＝終了3時間後）を判定する。以前はイベント状態しか見ておらず、イベントが
  // 終わった後もタッチ決済を受け付けていた（2026-10-22）。期間判定だけはテスト用QR（bypass_validity）で飛ばせる
  const qrEvent = qrc.event as unknown as { lifecycle_status: string | null; start_at: string | null; end_at: string | null } | null;
  const verdict = evaluatePurchaseWindow({
    lifecycleStatus: qrEvent?.lifecycle_status,
    eventStartAt: qrEvent?.start_at,
    eventEndAt: qrEvent?.end_at,
    product,
    bypassValidity: qrc.bypass_validity === true,
    salesStoppedAt: qrc.sales_stopped_at,
  });
  if (!verdict.ok) {
    return NextResponse.json({ error: purchaseWindowErrorMessage(verdict), reason: verdict.reason }, { status: 400 });
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

  // 在庫の仮押さえ（在庫管理対象の商品のみ）。以前はタッチ決済の販売を在庫に一切数えて
  // いなかった（2026-10-11修正）。決済完了（terminal/complete）で販売済みに移す
  const hold = await holdStock(admin, product_id, quantity, TERMINAL_HOLD_TTL_SEC);
  if (hold.status === "sold_out") {
    return NextResponse.json({ error: SOLD_OUT_MESSAGE, reason: "sold_out" }, { status: 409 });
  }
  const holdKey = hold.status === "held" ? hold.holdKey : null;

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
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
        ...(holdKey ? { stock_hold_key: holdKey } : {}),
      },
    });
  } catch (err) {
    if (holdKey) await releaseStock(admin, holdKey);
    throw err;
  }

  return NextResponse.json({
    client_secret: paymentIntent.client_secret,
    payment_intent_id: paymentIntent.id,
    amount,
    quantity,
  });
}
