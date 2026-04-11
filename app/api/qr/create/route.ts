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
    artist_id,
    targets, // [{ profile_id, distribution_ratio }]
    is_personal = false,
  } = body as {
    event_id: string;
    label?: string;
    product_type: string;
    min_amount: number;
    max_amount: number;
    artist_id: string;
    targets: { profile_id: string; distribution_ratio: number }[];
    is_personal?: boolean;
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

  // 配分比率の合計チェック（86.4% = 0.864 の範囲内）
  const totalRatio = targets.reduce((sum, t) => sum + t.distribution_ratio, 0);
  if (Math.abs(totalRatio - 1.0) > 0.001) {
    return NextResponse.json({ error: "Distribution ratios must sum to 1.0" }, { status: 400 });
  }

  // product 作成
  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      event_id,
      artist_id,
      name: label ?? `${range.label} チア`,
      type: product_type,
      min_amount,
      max_amount,
    })
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
