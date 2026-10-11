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
  holdKey: string = crypto.randomUUID(),
): Promise<HoldResult> {
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

/**
 * 決済完了時。仮押さえを販売済みに移し、決済の PaymentIntent ID を台帳に残す
 * （キャンセル・返金で戻すときの手がかり）。仮押さえが無い・確定済みなら何もしない（冪等）
 */
export async function commitStock(
  admin: AdminClient,
  holdKey: string | null | undefined,
  paymentIntentId: string | null | undefined,
): Promise<void> {
  if (!holdKey) return;
  const { error } = await admin.rpc("commit_product_stock", { p_hold_key: holdKey, p_payment_ref: paymentIntentId ?? null });
  if (error) console.error(`[stock-hold] 確定失敗 hold=${holdKey}: ${error.message}`);
}

/**
 * 前売りAの予約の在庫キー。仮押さえ（予約時）・確定（カード登録完了時）・戻し（予約キャンセル・返金）を
 * すべてこのキーで行う。予約はカード登録が済むまで在庫を確定しない
 */
export const reservationRef = (reservationId: string) => `rsv:${reservationId}`;

/** 前売りAの予約キャンセル：その予約で数えた1枚を戻す（冪等） */
export async function releaseReservedStock(admin: AdminClient, reservationId: string): Promise<void> {
  const { error } = await admin.rpc("release_product_stock", { p_payment_ref: reservationRef(reservationId) });
  if (error) console.error(`[stock-hold] 予約の在庫戻し失敗 reservation=${reservationId}: ${error.message}`);
}

/**
 * 取引のキャンセル・返金：その取引の決済で数えた在庫を戻す（冪等）。
 * 決済（PaymentIntent）単位で戻すので、ウェルカムチアの2階行など同じ決済の行が
 * 一緒に渡されても二重には戻らない。前売りAが決済済みになった取引は、予約の分を戻す。
 * 台帳に無い販売（この仕組みより前の販売＝もともと数えていなかったもの）は戻さない。
 */
export async function releaseStockForTransactions(admin: AdminClient, transactionIds: string[]): Promise<void> {
  if (transactionIds.length === 0) return;
  const [{ data: txs }, { data: rsvs }] = await Promise.all([
    admin.from("transactions").select("stripe_payment_intent_id").in("transaction_id", transactionIds),
    admin.from("entrance_reservations").select("reservation_id").in("transaction_id", transactionIds),
  ]);
  const refs = new Set<string>();
  for (const t of txs ?? []) if (t.stripe_payment_intent_id) refs.add(t.stripe_payment_intent_id);
  for (const r of rsvs ?? []) refs.add(reservationRef(r.reservation_id));
  for (const ref of refs) {
    const { error } = await admin.rpc("release_product_stock", { p_payment_ref: ref });
    if (error) console.error(`[stock-hold] 在庫戻し失敗 ref=${ref}: ${error.message}`);
  }
}

/** 決済の開始に失敗したときは、押さえた分をすぐ手放す */
export async function releaseStock(admin: AdminClient, holdKey: string): Promise<void> {
  await admin.from("stock_holds").delete().eq("hold_key", holdKey);
}

export const SOLD_OUT_MESSAGE = "申し訳ありません。売り切れました。";

/**
 * 残り在庫（上限 − 販売済み − 支払い中の仮押さえ）。null は在庫管理の対象外（無制限）。
 * 購入画面で「売り切れ」を表示するために使う。実際の売り切れ判定は決済開始の仮押さえで行う
 */
export async function remainingStock(admin: AdminClient, productIds: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  if (productIds.length === 0) return out;
  const [{ data: products }, { data: holds }] = await Promise.all([
    admin.from("products").select("product_id, stock_limit, sold_count, track_inventory").in("product_id", productIds),
    admin.from("stock_holds").select("product_id, quantity").in("product_id", productIds)
      .is("committed_at", null).gt("expires_at", new Date().toISOString()),
  ]);
  for (const p of products ?? []) {
    if (p.stock_limit == null || !p.track_inventory) { out[p.product_id] = null; continue; }
    const held = (holds ?? []).filter((h) => h.product_id === p.product_id).reduce((n, h) => n + h.quantity, 0);
    out[p.product_id] = Math.max(p.stock_limit - (p.sold_count ?? 0) - held, 0);
  }
  return out;
}
