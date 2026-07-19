import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// フォールバック（product_type_configs が取得できなかった場合）
const PRODUCT_TYPE_FALLBACK: Record<string, { min: number; max: number; label: string }> = {
  standard:  { min: 500,  max: 3_000,   label: "スタンダード" },
  message:   { min: 1000, max: 5_000,   label: "メッセージ" },
  entrance:  { min: 300,  max: 30_000,  label: "エントランス" },
  custom:    { min: 500,  max: 100_000, label: "カスタム" },
};

// DB から有効な商品タイプ定義を取得
async function getProductTypeRanges(supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>) {
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

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
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
    payment_type?: "A" | "B" | "C" | "V";
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
  };

  // イベントが published かつ自分が organizer or agent であることを確認
  const { data: event } = await supabase
    .from("events")
    .select("event_id, lifecycle_status, organizer_profile_id, agent_id")
    .eq("event_id", event_id)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!["draft", "review_requested", "published", "ongoing"].includes(event.lifecycle_status)) {
    return NextResponse.json({ error: "このイベントではQRを作成できません" }, { status: 400 });
  }
  const { data: me } = await supabase.from("profiles").select("role").eq("profile_id", user.id).single();
  if (event.organizer_profile_id !== user.id && event.agent_id !== user.id && me?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // organizer は有効期間バイパスを使用不可
  const effectiveBypassValidity = me?.role === "organizer" ? false : bypass_validity;

  // 金額バリデーション（DB定義を参照）
  const productTypeRanges = await getProductTypeRanges(supabase);
  const range = productTypeRanges[product_type];
  if (!range) {
    return NextResponse.json({ error: "Invalid product type" }, { status: 400 });
  }
  if (min_amount < range.min || max_amount > range.max || min_amount > max_amount) {
    return NextResponse.json(
      { error: `Amount must be between ${range.min} and ${range.max}` },
      { status: 400 },
    );
  }
  if (default_amount != null && (default_amount < min_amount || default_amount > max_amount)) {
    return NextResponse.json(
      { error: `Default amount must be between ${min_amount} and ${max_amount}` },
      { status: 400 },
    );
  }

  // 宛先必須チェック
  if (!recipient_profile_id) {
    return NextResponse.json({ error: "宛先を選択してください" }, { status: 400 });
  }
  if (!["organizer", "artist"].includes(recipient_name_context)) {
    return NextResponse.json({ error: "recipient_name_context が不正です" }, { status: 400 });
  }

  // 配分先必須チェック・比率合計チェック
  if (!targets || targets.length === 0) {
    return NextResponse.json({ error: "配分先を1人以上指定してください" }, { status: 400 });
  }
  const totalRatio = targets.reduce((sum, t) => sum + t.distribution_ratio, 0);
  if (Math.abs(totalRatio - 1.0) > 0.001) {
    return NextResponse.json({ error: "配分比率の合計を100%にしてください" }, { status: 400 });
  }

  const artistId = targets.length === 1 ? targets[0].profile_id : null;
  const productName = label ?? `${range.label} チア`;

  // 対面タッチ決済（Case④）はentrance×Cタイプ、またはcustom×バウチャー(V)×金額固定のみ許可。
  // クライアントの申告を信用せず、サーバー側で対象条件を再検証する。
  const touchpayAllowedType =
    (product_type === "entrance" && payment_type === "C") ||
    (product_type === "custom" && payment_type === "V" && min_amount === max_amount);
  const effectiveTouchpayEnabled = touchpay_enabled && touchpayAllowedType;

  // ウェルカムチア（2階建て構造）はentrance×Cタイプのみ許可。
  // 合計金額（1階）から一部（2階）を切り出すため、必ず合計金額未満でなければならない。
  const welcomeCheerAllowedType = product_type === "entrance" && payment_type === "C";
  if (welcome_cheer_amount != null) {
    if (!welcomeCheerAllowedType) {
      return NextResponse.json({ error: "ウェルカムチアはエントランス×Cタイプのみ設定できます" }, { status: 400 });
    }
    if (!Number.isInteger(welcome_cheer_amount) || welcome_cheer_amount <= 0) {
      return NextResponse.json({ error: "ウェルカムチアの金額が不正です" }, { status: 400 });
    }
    if (welcome_cheer_amount >= min_amount) {
      return NextResponse.json({ error: "ウェルカムチアの金額はエントランス料金より低くしてください" }, { status: 400 });
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
      return NextResponse.json({ error: "選択されたチアQRの一部が対象条件を満たしていません" }, { status: 400 });
    }
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
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const row = (rpcRows as any[])[0];

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
      return NextResponse.json({ error: `ウェルカムチアのデフォルト先作成に失敗しました: ${wcError.message}` }, { status: 500 });
    }

    welcomeCheerProductId = (wcRows as any[])[0].out_product_id;

    const { error: linkError } = await adminClient
      .from("products")
      .update({
        welcome_cheer_amount,
        welcome_cheer_default_product_id: welcomeCheerProductId,
      })
      .eq("product_id", row.out_product_id);

    if (linkError) {
      return NextResponse.json({ error: `ウェルカムチアの紐付けに失敗しました: ${linkError.message}` }, { status: 500 });
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
      return NextResponse.json({ error: `ウェルカムチア候補の登録に失敗しました: ${eligibleError.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    qr_config_id: row.out_qr_config_id,
    product_id:   row.out_product_id,
    welcome_cheer_product_id: welcomeCheerProductId,
  });
}
