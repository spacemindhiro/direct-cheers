import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createQr } from "@/lib/qr/create-qr";

// 判定と作成は lib/qr/create-qr.ts（チアリーの確認カードと共用）
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const r = await createQr(supabase, user.id, await req.json());
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  return NextResponse.json({
    qr_config_id: r.qr_config_id,
    product_id:   r.product_id,
    welcome_cheer_product_id: r.welcome_cheer_product_id,
  });
}
