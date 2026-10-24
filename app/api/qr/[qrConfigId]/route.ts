import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQRWithPermission, updateQr } from "@/lib/qr/update-qr";

// ラベル・宛先・配分更新（判定と更新は lib/qr/update-qr.ts。チアリーの確認カードと共用）
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> },
) {
  const { qrConfigId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const r = await updateQr(supabase, user.id, qrConfigId, await req.json());
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}

// 論理削除
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> },
) {
  const { qrConfigId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { qr, admin, isAdmin, isOrganizer, isAgent, error } = await getQRWithPermission(supabase, qrConfigId, user.id);
  if (!qr) return NextResponse.json({ error }, { status: error === "Forbidden" ? 403 : 404 });

  if (!isAdmin && !isOrganizer && !isAgent) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ウェルカムチアのデフォルト受取先として内部的に自動生成されたQRは、
  // エントランスQRの決済処理が参照し続けるため単独では削除できない
  // （エントランスQR自体を削除したときに連鎖削除される）
  if (qr.is_welcome_cheer_default) {
    return NextResponse.json(
      { error: "このQRはウェルカムチアのデフォルト受取先として自動生成されたものです。単独では削除できません。" },
      { status: 409 },
    );
  }

  const adminClient = admin ?? createAdminClient();

  // 売上が1件でもある場合は削除不可
  const { count } = await adminClient
    .from("transactions")
    .select("transaction_id", { count: "exact", head: true })
    .eq("qr_config_id", qrConfigId);

  if (count && count > 0) {
    return NextResponse.json(
      { error: "このQRコードにはすでに売上があるため削除できません" },
      { status: 409 },
    );
  }

  // このQRがウェルカムチア付きエントランスQRなら、内部的に自動生成した
  // デフォルト受取先（別のqr_configs/products行）も連鎖削除する。
  // そちらに売上がある場合も削除不可にする（購入者が既に演者を確定した
  // ケース等で、実際の配分記録が残っているため）。
  let cascadeQrConfigId: string | null = null;
  let cascadeProductId: string | null = null;
  if (qr.product_id) {
    const { data: entranceProduct } = await adminClient
      .from("products")
      .select("welcome_cheer_default_product_id")
      .eq("product_id", qr.product_id)
      .maybeSingle();

    if (entranceProduct?.welcome_cheer_default_product_id) {
      cascadeProductId = entranceProduct.welcome_cheer_default_product_id;
      const { data: cascadeQr } = await adminClient
        .from("qr_configs")
        .select("qr_config_id")
        .eq("product_id", cascadeProductId)
        .is("deleted_at", null)
        .maybeSingle();
      cascadeQrConfigId = cascadeQr?.qr_config_id ?? null;

      if (cascadeQrConfigId) {
        const { count: cascadeCount } = await adminClient
          .from("transactions")
          .select("transaction_id", { count: "exact", head: true })
          .eq("qr_config_id", cascadeQrConfigId);
        if (cascadeCount && cascadeCount > 0) {
          return NextResponse.json(
            { error: "ウェルカムチアの配分実績が残っているため削除できません" },
            { status: 409 },
          );
        }
      }
    }
  }

  const now = new Date().toISOString();

  const { error: deleteError } = await adminClient
    .from("qr_configs")
    .update({ deleted_at: now })
    .eq("qr_config_id", qrConfigId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  // QRと1:1の商品も一緒に削除する（商品だけ生き残って他機能の候補一覧等に
  // 紛れ込み続けるのを防ぐ）
  if (qr.product_id) {
    await adminClient.from("products").update({ deleted_at: now }).eq("product_id", qr.product_id);
  }

  // ウェルカムチアのデフォルト受取先を連鎖削除
  if (cascadeQrConfigId) {
    await adminClient.from("qr_configs").update({ deleted_at: now }).eq("qr_config_id", cascadeQrConfigId);
  }
  if (cascadeProductId) {
    await adminClient.from("products").update({ deleted_at: now }).eq("product_id", cascadeProductId);
  }

  return NextResponse.json({ ok: true });
}
