import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 商品タイプごとの金額範囲
export const PRODUCT_TYPE_RANGES: Record<string, { min: number; max: number; label: string }> = {
  standard:  { min: 500,  max: 5_000,   label: "スタンダード" },
  message:   { min: 1000, max: 10_000,  label: "メッセージ" },
  entrance:  { min: 300,  max: 3_000,   label: "エントランス" },
  custom:    { min: 500,  max: 100_000, label: "カスタム" },
};

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
  if (event.lifecycle_status !== "published") {
    return NextResponse.json({ error: "Event is not published" }, { status: 400 });
  }
  if (event.organizer_profile_id !== user.id && event.agent_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 金額バリデーション
  const range = PRODUCT_TYPE_RANGES[product_type];
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
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert(productInsert)
    .select("product_id")
    .single();

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  // qr_config 作成
  const { data: qrConfig, error: qrError } = await supabase
    .from("qr_configs")
    .insert({
      event_id,
      creator_profile_id: user.id,
      recipient_profile_id,
      label: label ?? null,
      is_personal,
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

  const { error: targetError } = await supabase
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
