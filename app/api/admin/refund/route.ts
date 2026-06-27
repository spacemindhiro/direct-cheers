import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function parsePiId(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      const p = JSON.parse(raw);
      if (p?.id) return p.id;
    } catch {}
  }
  return raw;
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (me?.role !== "admin")
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { user, error: null };
}

// GET /api/admin/refund?pi=pi_xxx  —  PI情報 + 関連トランザクション照会
export async function GET(req: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const admin = createAdminClient();
  const url = new URL(req.url);
  const piId = url.searchParams.get("pi")?.trim() ?? "";

  if (!piId.startsWith("pi_")) {
    return NextResponse.json({ error: "PaymentIntent IDは pi_ から始まる必要があります" }, { status: 400 });
  }

  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(piId);
  } catch (err: any) {
    return NextResponse.json({ error: `Stripe エラー: ${err.message}` }, { status: 404 });
  }

  let tx: any = null;
  {
    const { data } = await admin
      .from("transactions")
      .select(
        "transaction_id, total_gross_amount, stripe_fee, net_amount, platform_fee, status, transaction_type, created_at, qr_config_id"
      )
      .eq("stripe_payment_intent_id", piId)
      .maybeSingle();
    tx = data;
  }
  if (!tx) {
    const { data } = await admin
      .from("transactions")
      .select(
        "transaction_id, total_gross_amount, stripe_fee, net_amount, platform_fee, status, transaction_type, created_at, qr_config_id"
      )
      .ilike("stripe_payment_intent_id", `%${piId}%`)
      .limit(1)
      .maybeSingle();
    tx = data;
  }

  let event: any = null;
  let organizer: any = null;
  let settleTransfers: any[] = [];

  if (tx?.qr_config_id) {
    const { data: qrConfig } = await admin
      .from("qr_configs")
      .select("event_id")
      .eq("qr_config_id", tx.qr_config_id)
      .single();

    if (qrConfig?.event_id) {
      const { data: ev } = await admin
        .from("events")
        .select("event_id, title, lifecycle_status, organizer_profile_id")
        .eq("event_id", qrConfig.event_id)
        .single();
      event = ev;

      if (ev?.organizer_profile_id) {
        const { data: org } = await admin
          .from("profiles")
          .select("display_name, stripe_connect_id")
          .eq("profile_id", ev.organizer_profile_id)
          .single();
        organizer = org;
      }

      if (ev?.event_id) {
        const { data: sts } = await admin
          .from("settle_transfers")
          .select("stripe_transfer_id, profile_id, amount")
          .eq("event_id", ev.event_id);
        settleTransfers = sts ?? [];
      }
    }
  }

  const piStatusLabel =
    pi.status === "requires_capture"
      ? "オーソリ中"
      : pi.status === "succeeded" && event?.lifecycle_status === "settled"
      ? "精算済み"
      : pi.status === "succeeded"
      ? "キャプチャ済み"
      : pi.status === "canceled"
      ? "キャンセル済み"
      : pi.status;

  return NextResponse.json({
    paymentIntentId: piId,
    stripeStatus: pi.status,
    statusLabel: piStatusLabel,
    amount: pi.amount,
    currency: pi.currency,
    created: pi.created,
    onBehalfOf: pi.on_behalf_of,
    organizerName: organizer?.display_name ?? null,
    organizerConnectId: organizer?.stripe_connect_id ?? null,
    transactionId: tx?.transaction_id ?? null,
    transactionStatus: tx?.status ?? null,
    transactionType: tx?.transaction_type ?? null,
    eventTitle: event?.title ?? null,
    isSettled: event?.lifecycle_status === "settled",
    stripeFee: tx?.stripe_fee ?? null,
    platformFee: tx?.platform_fee ?? null,
    netAmount: tx?.net_amount ?? null,
    settleTransferCount: settleTransfers.length,
    settleTransferTotal: settleTransfers.reduce((s, t) => s + t.amount, 0),
  });
}

// POST /api/admin/refund  —  返金実行
//
// 5パターンの処理:
//   1. requires_capture          → PI cancel（全額ノーダメージ）
//   2. succeeded + settle前 + FULL_PENALTY    → refund + debt_claims(platform_fee)
//   3. succeeded + settle前 + COMPASSIONATE   → refund + debt_claims(stripe_fee)
//   4. succeeded + settle後 + FULL_PENALTY    → refund + 全transfer逆転(按分) + debt_claims(platform_fee)
//   5. succeeded + settle後 + COMPASSIONATE   → refund + 全transfer逆転(按分) + debt_claims(stripe_fee)
export async function POST(req: Request) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const admin = createAdminClient();

  let body: { paymentIntentId?: string; refundType?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { paymentIntentId, refundType, reason } = body;

  if (!paymentIntentId || !reason?.trim()) {
    return NextResponse.json(
      { error: "paymentIntentId と reason は必須です" },
      { status: 400 }
    );
  }

  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err: any) {
    return NextResponse.json({ error: `Stripe エラー: ${err.message}` }, { status: 404 });
  }

  if (["canceled", "refunded"].includes(pi.status)) {
    return NextResponse.json(
      { error: `このPIは返金・キャンセル済みです（status: ${pi.status}）` },
      { status: 400 }
    );
  }

  // DB からトランザクション取得
  let tx: any = null;
  {
    const { data } = await admin
      .from("transactions")
      .select(
        "transaction_id, stripe_fee, net_amount, total_gross_amount, platform_fee, status, qr_config_id"
      )
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();
    tx = data;
  }
  if (!tx) {
    const { data } = await admin
      .from("transactions")
      .select(
        "transaction_id, stripe_fee, net_amount, total_gross_amount, platform_fee, status, qr_config_id"
      )
      .ilike("stripe_payment_intent_id", `%${paymentIntentId}%`)
      .limit(1)
      .maybeSingle();
    tx = data;
  }

  // イベント・organizer 情報取得（debt_claims 用）
  let eventId: string | null = null;
  let organizerProfileId: string | null = null;
  if (tx?.qr_config_id) {
    const { data: qrConfig } = await admin
      .from("qr_configs")
      .select("event_id")
      .eq("qr_config_id", tx.qr_config_id)
      .single();
    eventId = qrConfig?.event_id ?? null;
  }
  if (eventId) {
    const { data: ev } = await admin
      .from("events")
      .select("organizer_profile_id")
      .eq("event_id", eventId)
      .single();
    organizerProfileId = ev?.organizer_profile_id ?? null;
  }

  // 手数料計算（debt_claims 金額の基準）
  const gross = pi.amount;
  const stripeFee = tx?.stripe_fee ?? Math.floor(gross * 0.0396);
  const platformFee = tx?.platform_fee ?? Math.floor(gross * 0.10);

  // ── ケース1: オーソリ中 → PI cancel（資金移動ゼロ）
  if (pi.status === "requires_capture") {
    await stripe.paymentIntents.cancel(paymentIntentId);

    if (tx?.transaction_id) {
      await admin
        .from("transactions")
        .update({ status: "cancelled" })
        .eq("transaction_id", tx.transaction_id);
    }

    return NextResponse.json({
      success: true,
      mode: "cancel",
      message: "オーソリを取り消しました。客のカード利用枠が解放されます。プラットフォームへの影響はゼロです。",
    });
  }

  if (pi.status !== "succeeded") {
    return NextResponse.json(
      { error: `返金不可のステータス: ${pi.status}` },
      { status: 400 }
    );
  }

  // settle_transfers 確認（settle前後の判断）
  const settleTransfers = eventId
    ? (
        await admin
          .from("settle_transfers")
          .select("stripe_transfer_id, amount, profile_id")
          .eq("event_id", eventId)
      ).data ?? []
    : [];
  const hasSettleTransfers = settleTransfers.length > 0;

  // refundType バリデーション（succeeded の場合は常に必須）
  if (!refundType || !["FULL_PENALTY", "COMPASSIONATE"].includes(refundType)) {
    return NextResponse.json(
      { error: "refundType (FULL_PENALTY または COMPASSIONATE) が必要です" },
      { status: 400 }
    );
  }

  // debt 金額: FULL_PENALTY=platform_fee, COMPASSIONATE=stripe_fee
  const baseDebt = refundType === "FULL_PENALTY" ? platformFee : stripeFee;

  // ── ケース2a/2b: キャプチャ後・settle前 → refund + debt_claims
  // settle_transfers なし = organizer はまだ何も受け取っていない。Transfer 逆転は不要。
  // ただし Stripe 手数料は既確定で戻らないため、モードに応じてプラットフォームの損失を organizer に請求記録する。
  if (!hasSettleTransfers) {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      metadata: { reason: reason.trim(), refundType, admin_user_id: user!.id },
    });

    // debt_claims 作成（organizer への将来回収の記録）
    if (organizerProfileId && tx?.transaction_id && baseDebt > 0) {
      await admin.from("debt_claims").insert({
        profile_id: organizerProfileId,
        original_transaction_id: tx.transaction_id,
        claim_amount: baseDebt,
        description:
          refundType === "FULL_PENALTY"
            ? `返金（通常モード・settle前）: プラットフォーム手数料 PI:${paymentIntentId}`
            : `返金（人情モード・settle前）: Stripe手数料 PI:${paymentIntentId}`,
      });
    }

    if (tx?.transaction_id) {
      await admin
        .from("transactions")
        .update({ status: "refunded" })
        .eq("transaction_id", tx.transaction_id);
    }

    return NextResponse.json({
      success: true,
      mode: refundType === "FULL_PENALTY" ? "presettle_full_penalty" : "presettle_compassionate",
      refundId: refund.id,
      totalReversed: 0,
      reversalErrors: 0,
      debtAmount: baseDebt,
      message:
        refundType === "FULL_PENALTY"
          ? `返金を実行しました（通常モード・settle前）。プラットフォーム手数料 ${baseDebt.toLocaleString("ja-JP")}円の請求記録を作成しました。将来の精算時にオーガナイザーから回収してください。`
          : `返金を実行しました（人情モード・settle前）。Stripe手数料 ${baseDebt.toLocaleString("ja-JP")}円の請求記録を作成しました。将来の精算時にオーガナイザーから回収してください。`,
    });
  }

  // ── ケース2c/2d: キャプチャ後・settle後 → refund + 全transfer逆転(按分) + debt_claims
  // artist/agent/organizer の全 settle_transfer を fraction で逆転。
  // さらに organizer に対して debt_claims を作成（FULL_PENALTY=platform_fee, COMPASSIONATE=stripe_fee）。
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    metadata: { reason: reason.trim(), refundType, admin_user_id: user!.id },
  });

  const totalSettled = settleTransfers.reduce((s, t) => s + t.amount, 0);
  const thisGross = tx?.total_gross_amount ?? pi.amount;
  // 複数PI存在するイベントの場合の按分（このPIに帰属する割合、最大1）
  const fraction = totalSettled > 0 ? Math.min(thisGross / totalSettled, 1) : 1;

  // 全settle_transfer を按分額で逆転（role に関わらず全員）
  const reversalResults: { transfer_id: string; reversed: number; error?: string }[] = [];
  for (const st of settleTransfers) {
    const reversalAmount = Math.floor(st.amount * fraction);
    if (reversalAmount <= 0) continue;
    try {
      await stripe.transfers.createReversal(st.stripe_transfer_id, {
        amount: reversalAmount,
        metadata: { reason: reason.trim(), refundType, admin_user_id: user!.id },
      });
      reversalResults.push({ transfer_id: st.stripe_transfer_id, reversed: reversalAmount });
    } catch (err: any) {
      console.error(`[refund] reversal failed transfer=${st.stripe_transfer_id}:`, err.message);
      reversalResults.push({ transfer_id: st.stripe_transfer_id, reversed: 0, error: err.message });
    }
  }

  // organizer への追加請求記録（Transfer逆転分を超えるプラットフォームの損失補填）
  const debtAmountProrated = Math.floor(baseDebt * fraction);
  if (organizerProfileId && tx?.transaction_id && debtAmountProrated > 0) {
    await admin.from("debt_claims").insert({
      profile_id: organizerProfileId,
      original_transaction_id: tx.transaction_id,
      claim_amount: debtAmountProrated,
      description:
        refundType === "FULL_PENALTY"
          ? `返金（通常モード・settle後）: プラットフォーム手数料 PI:${paymentIntentId}`
          : `返金（人情モード・settle後）: Stripe手数料 PI:${paymentIntentId}`,
    });
  }

  if (tx?.transaction_id) {
    await admin
      .from("transactions")
      .update({ status: "refunded" })
      .eq("transaction_id", tx.transaction_id);
  }

  const totalReversed = reversalResults.reduce((s, r) => s + r.reversed, 0);
  const reversalErrors = reversalResults.filter((r) => r.error).length;

  return NextResponse.json({
    success: true,
    mode: refundType,
    refundId: refund.id,
    reversals: reversalResults,
    totalReversed,
    reversalErrors,
    debtAmount: debtAmountProrated,
    message:
      refundType === "FULL_PENALTY"
        ? `通常モードで返金を実行しました。${totalReversed.toLocaleString("ja-JP")}円を全Connectアカウントから回収。プラットフォーム手数料 ${debtAmountProrated.toLocaleString("ja-JP")}円の請求記録を作成しました。`
        : `人情モードで返金を実行しました。${totalReversed.toLocaleString("ja-JP")}円を全Connectアカウントから回収。Stripe手数料 ${debtAmountProrated.toLocaleString("ja-JP")}円の請求記録を作成しました。`,
  });
}
