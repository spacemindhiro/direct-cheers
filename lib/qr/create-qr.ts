// QR の作成（products + qr_configs + qr_config_targets）。作成画面の API（app/api/qr/create）と
// チアリー(AI) の確認カード（lib/mcp/tools/qr-create.ts）で共用する。判定はすべてここ（送られた中身は信用しない）。
// supabase は本人のセッション（イベントの読み取りは本人の権限で）、userId は作る人。
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProxyDraftHiddenFrom } from "@/lib/proxy-draft";
import { isValidQrImageUrl } from "@/lib/image-source";
import { getFeeConfig } from "@/lib/fee-config";
import { needsQrImage, organizerBalance, qrPeople, recipientError, salesPeriodError, targetsError, typeBReserveRequired } from "@/lib/qr/rules";

// フォールバック（product_type_configs が取得できなかった場合）
const PRODUCT_TYPE_FALLBACK: Record<string, { min: number; max: number; label: string }> = {
  standard:  { min: 50, max: 3_000,   label: "スタンダード" },
  message:   { min: 50, max: 5_000,   label: "メッセージ" },
  entrance:  { min: 50, max: 30_000,  label: "エントランス" },
  custom:    { min: 50, max: 100_000, label: "カスタム" },
};

// DB から有効な商品タイプ定義を取得
async function getProductTypeRanges(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("product_type_configs")
    .select("type, label, min_amount, max_amount, is_enabled");
  if (!data || data.length === 0) return PRODUCT_TYPE_FALLBACK;
  return Object.fromEntries(
    data
      .filter((r) => r.is_enabled)
      .map((r) => [r.type, { min: r.min_amount, max: r.max_amount, label: r.label }])
  );
}

export type CreateQrResult =
  | { ok: true; qr_config_id: string; product_id: string; welcome_cheer_product_id: string | null }
  | { ok: false; error: string; status: number };

const fail = (error: string, status: number): CreateQrResult => ({ ok: false, error, status });

export async function createQr(supabase: SupabaseClient, userId: string, body: Record<string, unknown>): Promise<CreateQrResult> {
  const user = { id: userId };
  const {
    event_id,
    label,
    product_type,
    min_amount,
    max_amount,
    recipient_profile_id,
    recipient_name_context = "artist",
    targets, // [{ profile_id, distribution_ratio }]
    is_personal = false,
    payment_type = "A",
    stock_limit = null,
    track_inventory = true,
    image_url = null,
    serial_scope = "event",
    sales_start_at = null,
    sales_end_at = null,
    bypass_validity = false,
    strip_image_url = null,
    bg_color = "#0f172a",
    fg_color = "#ffffff",
    label_color = "#94a3b8",
    amount_step = 100,
    default_amount = null,
    touchpay_enabled = false,
    welcome_cheer_amount = null,
    welcome_cheer_eligible_product_ids = [],
    quantity_selectable = true,
    bulk_pricing = null,
    auto_checkin = false,
  } = body as {
    event_id: string;
    label?: string;
    product_type: string;
    min_amount: number;
    max_amount: number;
    recipient_profile_id: string;
    recipient_name_context?: "organizer" | "artist";
    targets: { profile_id: string; distribution_ratio: number }[];
    is_personal?: boolean;
    payment_type?: "A" | "B" | "C" | "V" | "D";
    stock_limit?: number | null;
    track_inventory?: boolean;
    image_url?: string | null;
    serial_scope?: "event" | "qr" | "artist";
    sales_start_at?: string | null;
    sales_end_at?: string | null;
    bypass_validity?: boolean;
    strip_image_url?: string | null;
    bg_color?: string;
    fg_color?: string;
    label_color?: string;
    amount_step?: 100 | 500 | 1000;
    default_amount?: number | null;
    touchpay_enabled?: boolean;
    welcome_cheer_amount?: number | null;
    welcome_cheer_eligible_product_ids?: string[];
    quantity_selectable?: boolean;
    bulk_pricing?: { min_quantity: number; unit_price: number }[] | null;
    auto_checkin?: boolean;
  };

  // イベントが published かつ自分が organizer or agent であることを確認
  const { data: event } = await supabase
    .from("events")
    .select("event_id, lifecycle_status, organizer_profile_id, agent_id")
    .eq("event_id", event_id)
    .single();

  if (!event) {
    return fail("Event not found", 404);
  }
  if (!["draft", "review_requested", "published", "ongoing"].includes(event.lifecycle_status)) {
    return fail("このイベントではQRを作成できません", 400);
  }
  const { data: me } = await supabase.from("profiles").select("role").eq("profile_id", user.id).single();
  if (event.organizer_profile_id !== user.id && event.agent_id !== user.id && me?.role !== "admin") {
    return fail("Forbidden", 403);
  }
  // 代理作成でまだ主催者に送っていない下書きは、主催者からは存在しない扱い
  if (event.agent_id !== user.id && me?.role !== "admin" &&
      await isProxyDraftHiddenFrom(createAdminClient(), event.event_id, user.id)) {
    return fail("Event not found", 404);
  }

  // 画像は自分たちの Storage に上げたものだけ（外部URLはウォレットカード作成時にサーバーが取りに行くため）
  if (!isValidQrImageUrl(image_url) || !isValidQrImageUrl(strip_image_url)) {
    return fail("画像の形式が不正です", 400);
  }

  // 有効期間バイパスはadmin限定
  const effectiveBypassValidity = me?.role === "admin" ? bypass_validity : false;

  // 金額バリデーション（DB定義を参照）
  const productTypeRanges = await getProductTypeRanges(supabase);
  const range = productTypeRanges[product_type];
  if (!range) {
    return fail("Invalid product type", 400);
  }
  if (min_amount < range.min || max_amount > range.max || min_amount > max_amount) {
    return fail(`Amount must be between ${range.min} and ${range.max}`, 400);
  }
  if (default_amount != null && (default_amount < min_amount || default_amount > max_amount)) {
    return fail(`Default amount must be between ${min_amount} and ${max_amount}`, 400);
  }

  // ラベル・QR画像（画面と同じ判定。API を直接呼ぶと飛ばせていた）
  if (typeof label !== "string" || !label.trim()) {
    return fail("ラベルを入力してください", 400);
  }
  if (needsQrImage(product_type, payment_type) && !image_url) {
    return fail("QR画像をアップロードしてください", 400);
  }

  // 宛先必須チェック
  if (!recipient_profile_id) {
    return fail("宛先を選択してください", 400);
  }
  if (!["organizer", "artist"].includes(recipient_name_context)) {
    return fail("recipient_name_context が不正です", 400);
  }

  // 配分先必須チェック・比率合計チェック
  if (!Array.isArray(targets) || targets.length === 0) {
    return fail("配分先を1人以上指定してください", 400);
  }
  // 宛先・配分先はこのイベントの主催者と出演者（断った人を除く）だけ。宛先は配分先に入っていること（画面と同じ）
  const people = await qrPeople(createAdminClient(), event_id, event.organizer_profile_id);
  const personError = recipientError(people, recipient_profile_id, recipient_name_context) ?? targetsError(people, targets);
  if (personError) {
    return fail(personError, 400);
  }
  if (!targets.some((t) => t.profile_id === recipient_profile_id)) {
    return fail("宛先を配分先に含めてください", 400);
  }
  // 1人ずつ 0〜100% の範囲。合計だけの確認では「109% と -9%」が通り、精算で運営の資金から払い出されていた
  if (!targets.every((t) => typeof t.distribution_ratio === "number" && Number.isFinite(t.distribution_ratio)
    && t.distribution_ratio >= 0 && t.distribution_ratio <= 1)) {
    return fail("配分比率は0〜100%で指定してください", 400);
  }
  const totalRatio = targets.reduce((sum, t) => sum + t.distribution_ratio, 0);
  if (Math.abs(totalRatio - 1.0) > 0.001) {
    return fail("配分比率の合計を100%にしてください", 400);
  }

  // 前売り（エントランス×A/B）の販売期間と、前売即時確定（B）の残高（画面と同じ判定）
  const periodError = salesPeriodError(product_type, payment_type, sales_start_at, sales_end_at);
  if (periodError) {
    return fail(periodError, 400);
  }
  const reserveRequired = typeBReserveRequired({
    productType: product_type, paymentType: payment_type, stockLimit: stock_limit, maxAmount: max_amount,
    stripeRate: (await getFeeConfig()).stripe_rate,
  });
  if (reserveRequired > 0) {
    const balance = await organizerBalance(createAdminClient(), event.organizer_profile_id);
    if (balance < reserveRequired) {
      return fail(`前売即時確定タイプを利用するには残高が ¥${reserveRequired.toLocaleString()} 以上必要です（現在: ¥${balance.toLocaleString()}）`, 400);
    }
  }

  const artistId = targets.length === 1 ? targets[0].profile_id : null;
  const productName = label ?? `${range.label} チア`;

  // 対面タッチ決済（Case④）はentrance×Cタイプ、custom×バウチャー(V)×金額固定、
  // またはcustom×ドリンクチケット(D)×杯数指定オフのみ許可。
  // クライアントの申告を信用せず、サーバー側で対象条件を再検証する。
  const touchpayAllowedType =
    (product_type === "entrance" && payment_type === "C") ||
    (product_type === "custom" && payment_type === "V" && min_amount === max_amount) ||
    (product_type === "custom" && payment_type === "D" && quantity_selectable === false);
  const effectiveTouchpayEnabled = touchpay_enabled && touchpayAllowedType;

  // ウェルカムチア（2階建て構造）はentrance×Cタイプのみ許可。
  // 合計金額（1階）から一部（2階）を切り出すため、必ず合計金額未満でなければならない。
  const welcomeCheerAllowedType = product_type === "entrance" && payment_type === "C";
  if (welcome_cheer_amount != null) {
    if (!welcomeCheerAllowedType) {
      return fail("ウェルカムチアはエントランス×Cタイプのみ設定できます", 400);
    }
    if (!Number.isInteger(welcome_cheer_amount) || welcome_cheer_amount <= 0) {
      return fail("ウェルカムチアの金額が不正です", 400);
    }
    if (welcome_cheer_amount >= min_amount) {
      return fail("ウェルカムチアの金額はエントランス料金より低くしてください", 400);
    }
  }

  // ウェルカムチアの候補として選択された既存チアQRを検証する。
  // このイベントの、ワンプライスかつ2階金額と完全一致するstandard商品のみ許可。
  const adminForValidation = createAdminClient();
  let validatedEligibleProductIds: string[] = [];
  if (welcome_cheer_amount != null && welcome_cheer_eligible_product_ids.length > 0) {
    const { data: eligibleCandidates } = await adminForValidation
      .from("products")
      .select("product_id, event_id, type, min_amount, max_amount")
      .in("product_id", welcome_cheer_eligible_product_ids)
      .is("deleted_at", null);

    validatedEligibleProductIds = (eligibleCandidates ?? [])
      .filter((p) =>
        p.event_id === event_id &&
        p.type === "standard" &&
        p.min_amount === welcome_cheer_amount &&
        p.max_amount === welcome_cheer_amount
      )
      .map((p) => p.product_id);

    if (validatedEligibleProductIds.length !== welcome_cheer_eligible_product_ids.length) {
      return fail("選択されたチアQRの一部が対象条件を満たしていません", 400);
    }
  }

  // ドリンクチケット（custom×Dタイプ）: QRを使わない即時受け渡し用商品。
  // payment_type='D' は custom タイプでのみ使用可（entrance等での誤指定を防ぐ）。
  const isDrinkTicket = product_type === "custom" && payment_type === "D";
  if (payment_type === "D" && product_type !== "custom") {
    return fail("payment_type='D' はカスタムタイプのみ指定できます", 400);
  }
  if (isDrinkTicket && min_amount !== max_amount) {
    return fail("ドリンクチケットは金額を固定にしてください", 400);
  }
  if (auto_checkin && !(product_type === "entrance" && payment_type === "C")) {
    return fail("auto_checkin はエントランス×Cタイプのみ指定できます", 400);
  }
  let validatedBulkPricing: { min_quantity: number; unit_price: number }[] | null = null;
  if (isDrinkTicket && quantity_selectable && Array.isArray(bulk_pricing) && bulk_pricing.length > 0) {
    if (bulk_pricing.length > 4) {
      return fail("まとめ買い割引は最大4段階までです", 400);
    }
    let prevMinQty = 1;
    let prevUnitPrice = min_amount;
    for (const tier of bulk_pricing) {
      if (!Number.isInteger(tier.min_quantity) || tier.min_quantity <= prevMinQty) {
        return fail("まとめ買い割引の段階は杯数が昇順（2以上）である必要があります", 400);
      }
      if (!Number.isInteger(tier.unit_price) || tier.unit_price <= 0) {
        return fail("まとめ買い割引の単価が不正です", 400);
      }
      if (tier.unit_price > prevUnitPrice) {
        return fail("まとめ買い割引は杯数が増えるごとに単価を同額以下にしてください", 400);
      }
      prevMinQty = tier.min_quantity;
      prevUnitPrice = tier.unit_price;
    }
    validatedBulkPricing = bulk_pricing;
  } else if (!isDrinkTicket && bulk_pricing != null) {
    return fail("bulk_pricing はドリンクチケットのみ指定できます", 400);
  }

  // products + qr_configs + qr_config_targets をアトミックに作成
  const adminClient = createAdminClient();
  const { data: rpcRows, error: rpcError } = await adminClient.rpc("create_qr_bundle", {
    p_event_id:             event_id,
    p_creator_profile_id:   user.id,
    p_recipient_profile_id: recipient_profile_id,
    p_recipient_name_context: recipient_name_context,
    p_label:                label ?? null,
    p_is_personal:          is_personal,
    p_image_url:            image_url,
    p_product_type:         product_type,
    p_min_amount:           min_amount,
    p_max_amount:           max_amount,
    p_artist_id:            artistId,
    p_product_name:         productName,
    p_payment_type:         payment_type,
    p_stock_limit:          stock_limit,
    p_track_inventory:      track_inventory,
    p_serial_scope:         serial_scope,
    p_bypass_validity:      effectiveBypassValidity,
    p_strip_image_url:      strip_image_url,
    p_bg_color:             bg_color,
    p_fg_color:             fg_color,
    p_label_color:          label_color,
    p_sales_start_at:       sales_start_at,
    p_sales_end_at:         sales_end_at,
    p_targets:              targets,
    p_amount_step:          amount_step,
    p_default_amount:       default_amount,
    p_touchpay_enabled:     effectiveTouchpayEnabled,
  });

  if (rpcError) {
    return fail(rpcError.message, 500);
  }

  const row = (rpcRows as { out_product_id: string; out_qr_config_id: string }[])[0];

  // ドリンクチケット: 杯数指定可否・まとめ買い割引ティアを反映
  // （create_qr_bundle は汎用列のみ扱うため、作成後にUPDATEで設定する）
  if (isDrinkTicket) {
    const { error: drinkUpdateError } = await adminClient
      .from("products")
      .update({
        quantity_selectable,
        bulk_pricing: quantity_selectable ? validatedBulkPricing : null,
      })
      .eq("product_id", row.out_product_id);
    if (drinkUpdateError) {
      return fail(`ドリンクチケット設定の保存に失敗しました: ${drinkUpdateError.message}`, 500);
    }
  }

  // エントランス×Cタイプ: 決済完了と同時に入場確定（QRスキャン省略）フラグ
  if (product_type === "entrance" && payment_type === "C" && auto_checkin) {
    const { error: autoCheckinError } = await adminClient
      .from("products")
      .update({ auto_checkin: true })
      .eq("product_id", row.out_product_id);
    if (autoCheckinError) {
      return fail(`入場確定設定の保存に失敗しました: ${autoCheckinError.message}`, 500);
    }
  }

  // ウェルカムチア: デフォルト受取先（主催者宛のワンプライスチア）を同じ仕組み
  // （create_qr_bundle）でもう1本作成し、エントランス商品にリンクする。
  // 購入者が後から演者を選ぶまでは、このデフォルト先がウェルカムチアの宛先になる。
  let welcomeCheerProductId: string | null = null;
  if (welcome_cheer_amount != null) {
    const { data: wcRows, error: wcError } = await adminClient.rpc("create_qr_bundle", {
      p_event_id:             event_id,
      p_creator_profile_id:   user.id,
      p_recipient_profile_id: event.organizer_profile_id,
      p_recipient_name_context: "organizer",
      p_label:                `ウェルカムチア（${productName}）`,
      p_is_personal:          false,
      p_image_url:            null,
      p_product_type:         "standard",
      p_min_amount:           welcome_cheer_amount,
      p_max_amount:           welcome_cheer_amount,
      p_artist_id:            event.organizer_profile_id,
      p_product_name:         `ウェルカムチア（${productName}）`,
      p_payment_type:         null,
      p_stock_limit:          null,
      p_track_inventory:      false,
      p_serial_scope:         "event",
      p_bypass_validity:      true,
      p_strip_image_url:      null,
      p_bg_color:             "#0f172a",
      p_fg_color:             "#ffffff",
      p_label_color:          "#94a3b8",
      p_sales_start_at:       null,
      p_sales_end_at:         null,
      p_targets:              [{ profile_id: event.organizer_profile_id, distribution_ratio: 1 }],
      p_amount_step:          100,
      p_default_amount:       welcome_cheer_amount,
      p_touchpay_enabled:     false,
    });

    if (wcError) {
      return fail(`ウェルカムチアのデフォルト先作成に失敗しました: ${wcError.message}`, 500);
    }

    const wcRow = (wcRows as { out_product_id: string; out_qr_config_id: string }[])[0];
    welcomeCheerProductId = wcRow.out_product_id;

    // 内部的な受け皿であることを示すフラグを立て、通常のQR一覧・
    // チアQR候補選択・削除操作から除外されるようにする。
    const [{ error: flagProductError }, { error: flagQrError }] = await Promise.all([
      adminClient.from("products").update({ is_welcome_cheer_default: true }).eq("product_id", welcomeCheerProductId),
      adminClient.from("qr_configs").update({ is_welcome_cheer_default: true }).eq("qr_config_id", wcRow.out_qr_config_id),
    ]);
    if (flagProductError || flagQrError) {
      return fail(`ウェルカムチアのデフォルト先フラグ設定に失敗しました: ${(flagProductError ?? flagQrError)?.message}`, 500);
    }

    const { error: linkError } = await adminClient
      .from("products")
      .update({
        welcome_cheer_amount,
        welcome_cheer_default_product_id: welcomeCheerProductId,
      })
      .eq("product_id", row.out_product_id);

    if (linkError) {
      return fail(`ウェルカムチアの紐付けに失敗しました: ${linkError.message}`, 500);
    }

    // 候補テーブルに登録: デフォルト先（主催者）は常に含め、主催者が選んだ
    // 既存チアQRも合わせて登録する。
    const eligibleRows = [welcomeCheerProductId, ...validatedEligibleProductIds].map((cheerProductId) => ({
      entrance_product_id: row.out_product_id,
      cheer_product_id: cheerProductId,
    }));
    const { error: eligibleError } = await adminClient
      .from("welcome_cheer_eligible_products")
      .insert(eligibleRows);

    if (eligibleError) {
      return fail(`ウェルカムチア候補の登録に失敗しました: ${eligibleError.message}`, 500);
    }
  }

  return { ok: true, qr_config_id: row.out_qr_config_id, product_id: row.out_product_id, welcome_cheer_product_id: welcomeCheerProductId };
}
