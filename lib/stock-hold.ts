import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * 在庫の仮押さえ（stock_holds）。決済開始で押さえ、決済完了で販売済みに移す。
 *
 * 以前は在庫を数えていたのが前売り予約APIだけで、QR決済・タッチ決済からの販売は
 * 一度も数えていなかった（2026-10-11修正）。仮押さえは期限付きで、Stripe Checkout も
 * 同じ時間で失効させるため、払わずに離脱した分は戻す処理なしで自然に数えなくなる。
 */

// Stripe Checkout の有効期限の最小値は30分。仮押さえはそれより長く取り、
// 支払い画面が開いている間に他の人へ在庫が渡らないようにする
export const CHECKOUT_EXPIRES_SEC = 30 * 60;
export const CHECKOUT_HOLD_TTL_SEC = 35 * 60;
// タッチ決済（カードリーダー）は決済開始から完了までが短い
export const TERMINAL_HOLD_TTL_SEC = 10 * 60;

/** unlimited: 在庫管理の対象外（仮押さえ不要） / held: 仮押さえした / sold_out: 完売 */
export type HoldResult =
  | { status: "unlimited" }
  | { status: "held"; holdKey: string }
  | { status: "sold_out" };

export async function holdStock(
  admin: AdminClient,
  productId: string,
  quantity: number,
  ttlSeconds: number,
): Promise<HoldResult> {
  const holdKey = crypto.randomUUID();
  const { data, error } = await admin.rpc("hold_product_stock", {
    p_product_id: productId,
    p_quantity: quantity,
    p_hold_key: holdKey,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) throw new Error(`[stock-hold] 仮押さえ失敗: ${error.message}`);
  if (data === "held") return { status: "held", holdKey };
  if (data === "unlimited") return { status: "unlimited" };
  return { status: "sold_out" };
}

/** 決済完了時。仮押さえが無ければ何もしない（冪等なので完了処理が2回走っても二重に数えない） */
export async function commitStock(admin: AdminClient, holdKey: string | null | undefined): Promise<void> {
  if (!holdKey) return;
  const { error } = await admin.rpc("commit_product_stock", { p_hold_key: holdKey });
  if (error) console.error(`[stock-hold] 確定失敗 hold=${holdKey}: ${error.message}`);
}

/** 決済の開始に失敗したときは、押さえた分をすぐ手放す */
export async function releaseStock(admin: AdminClient, holdKey: string): Promise<void> {
  await admin.from("stock_holds").delete().eq("hold_key", holdKey);
}

export const SOLD_OUT_MESSAGE = "申し訳ありません。売り切れました。";
