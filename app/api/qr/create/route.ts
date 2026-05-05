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
  const { data: me } = await supabase.from("profiles").select("role").eq("profile_id", user.id).single();
  if (event.organizer_profile_id !== user.id && event.agent_id !== user.id && me?.role !== "admin") {
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

  const artistId = targets.length === 1 ? targets[0].profile_id : null;
  const productName = label ?? `${range.label} チア`;

  // products + qr_configs + qr_config_targets をアトミックに作成
  const adminClient = createAdminClient();
  const { data: rpcRows, error: rpcError } = await adminClient.rpc("create_qr_bundle", {
    p_event_id:             event_id,
    p_creator_profile_id:   user.id,
    p_recipient_profile_id: recipient_profile_id,
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
    p_bypass_validity:      bypass_validity,
    p_strip_image_url:      strip_image_url,
    p_bg_color:             bg_color,
    p_fg_color:             fg_color,
    p_label_color:          label_color,
    p_sales_start_at:       sales_start_at,
    p_sales_end_at:         sales_end_at,
    p_targets:              JSON.stringify(targets),
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const row = (rpcRows as any[])[0];
  return NextResponse.json({
    qr_config_id: row.out_qr_config_id,
    product_id:   row.out_product_id,
  });
}
