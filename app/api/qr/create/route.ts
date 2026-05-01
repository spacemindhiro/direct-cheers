import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// フォールバック（product_type_configs が取得できなかった場合）
const PRODUCT_TYPE_FALLBACK: Record<string, { min: number; max: number; label: string }> = {
  standard:  { min: 500,  max: 3_000,   label: "スタンダード" },
  message:   { min: 1000, max: 5_000,   label: "メッセージ" },
  entrance:  { min: 300,  max: 30_000,  label: "エントランス" },
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
  } = body as {
    event_id: string;
    label?: string;
    product_type: string;
    min_amount: number;
    max_amount: number;
    recipient_profile_id: string;
    targets: { profile_id: string; distribution_ratio: number }[];
    is_personal?: boolean;
    payment_type?: "A" | "B" | "C";
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
  if (event.organizer_profile_id !== user.id && event.agent_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  // 宛先必須チェック
  if (!recipient_profile_id) {
    return NextResponse.json({ error: "宛先を選択してください" }, { status: 400 });
  }

  // 配分先必須チェック・比率合計チェック
  if (!targets || targets.length === 0) {
    return NextResponse.json({ error: "配分先を1人以上指定してください" }, { status: 400 });
  }
  const totalRatio = targets.reduce((sum, t) => sum + t.distribution_ratio, 0);
  if (Math.abs(totalRatio - 1.0) > 0.001) {
    return NextResponse.json({ error: "配分比率の合計を100%にしてください" }, { status: 400 });
  }

  // product 作成（artist_id は配分先が複数の場合もあるため null 許容）
  const productInsert: Record<string, unknown> = {
    event_id,
    artist_id: targets.length === 1 ? targets[0].profile_id : null,
    name: label ?? `${range.label} チア`,
    type: product_type,
    min_amount,
    max_amount,
  };
  if (product_type === "entrance") {
    productInsert.payment_type = payment_type;
    productInsert.stock_limit = stock_limit ?? null;
    productInsert.track_inventory = track_inventory;
    if ((payment_type === "A" || payment_type === "B") && sales_start_at && sales_end_at) {
      productInsert.sales_start_at = sales_start_at;
      productInsert.sales_end_at = sales_end_at;
    }
  }

  // 権限チェック済みのため adminClient でRLSをバイパスしてinsert
  const adminClient = createAdminClient();

  const { data: product, error: productError } = await adminClient
    .from("products")
    .insert(productInsert)
    .select("product_id")
    .single();

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  // qr_config 作成
  const { data: qrConfig, error: qrError } = await adminClient
    .from("qr_configs")
    .insert({
      event_id,
      creator_profile_id: user.id,
      recipient_profile_id,
      label: label ?? null,
      is_personal,
      image_url: image_url ?? null,
      product_id: product.product_id,
      serial_scope,
      bypass_validity,
      ...(product_type === "entrance" && {
        strip_image_url: strip_image_url ?? null,
        bg_color,
        fg_color,
        label_color,
      }),
    })
    .select("qr_config_id")
    .single();

  if (qrError) {
    return NextResponse.json({ error: qrError.message }, { status: 500 });
  }

  // qr_config_targets 作成
  const targetRows = targets.map((t) => ({
    qr_config_id: qrConfig.qr_config_id,
    profile_id: t.profile_id,
    distribution_ratio: t.distribution_ratio,
  }));

  const { error: targetError } = await adminClient
    .from("qr_config_targets")
    .insert(targetRows);

  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500 });
  }

  return NextResponse.json({
    qr_config_id: qrConfig.qr_config_id,
    product_id: product.product_id,
  });
}
