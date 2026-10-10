/**
 * QR・商品の「今この瞬間に買えるか」の判定。
 *
 * 決済画面（app/c/[qrConfigId]/page.tsx）と決済開始API（pay/cheers・entrance/reserve）が
 * 必ずこの1つの関数を通す。以前は画面側にだけ判定があり、APIを直接叩けば期限切れ・
 * 削除済みQRや販売期間外でも決済が通っていた（2026-10-10発覚）。画面は表示の都合、
 * APIは実際の関所であり、判定ロジックを各所に書き写すと食い違いがまた生まれるため一元化する。
 */

/** 新規の決済・予約を一切受け付けないイベント状態 */
export const CLOSED_LIFECYCLES = ["draft", "cancelled", "settled"] as const;

/** 当日決済（チア・メッセージ・当日券等）の受付はイベント終了からこの時間まで */
export const POST_EVENT_GRACE_MS = 3 * 60 * 60 * 1000;

export type PurchaseWindowInput = {
  lifecycleStatus: string | null | undefined;
  eventStartAt: string | null | undefined;
  eventEndAt: string | null | undefined;
  product: {
    type?: string | null;
    payment_type?: string | null;
    sales_start_at?: string | null;
    sales_end_at?: string | null;
  };
  /** QRの bypass_validity（テスト用QR等）。期間判定だけを飛ばす。イベント状態の判定は飛ばさない */
  bypassValidity?: boolean;
  now?: Date;
};

export type PurchaseWindowVerdict =
  | { ok: true }
  | { ok: false; reason: "closed" }
  | { ok: false; reason: "before_sales"; salesStart: Date }
  | { ok: false; reason: "after_sales" }
  | { ok: false; reason: "before_event"; eventStart: Date }
  | { ok: false; reason: "after_event" };

export function evaluatePurchaseWindow(input: PurchaseWindowInput): PurchaseWindowVerdict {
  const { lifecycleStatus, eventStartAt, eventEndAt, product, bypassValidity } = input;
  const now = input.now ?? new Date();

  if (!lifecycleStatus || (CLOSED_LIFECYCLES as readonly string[]).includes(lifecycleStatus)) {
    return { ok: false, reason: "closed" };
  }
  if (bypassValidity) return { ok: true };

  // 前売り（エントランスA/B）は商品の販売期間で判定する
  const isEntranceAB =
    product.type === "entrance" && (product.payment_type === "A" || product.payment_type === "B");
  if (isEntranceAB) {
    const salesStart = product.sales_start_at ? new Date(product.sales_start_at) : null;
    const salesEnd = product.sales_end_at ? new Date(product.sales_end_at) : null;
    if (salesStart && now < salesStart) return { ok: false, reason: "before_sales", salesStart };
    if (salesEnd && now > salesEnd) return { ok: false, reason: "after_sales" };
    return { ok: true };
  }

  // それ以外は当日決済：イベント開始〜終了3時間後まで。日時が欠けているイベントは受け付けない
  if (!eventStartAt || !eventEndAt) return { ok: false, reason: "closed" };
  const eventStart = new Date(eventStartAt);
  const eventEndPlusGrace = new Date(new Date(eventEndAt).getTime() + POST_EVENT_GRACE_MS);
  if (now < eventStart) return { ok: false, reason: "before_event", eventStart };
  if (now > eventEndPlusGrace) return { ok: false, reason: "after_event" };
  return { ok: true };
}

/** API応答用の日本語メッセージ */
export function purchaseWindowErrorMessage(verdict: Exclude<PurchaseWindowVerdict, { ok: true }>): string {
  switch (verdict.reason) {
    case "closed": return "このイベントは現在決済を受け付けていません";
    case "before_sales": return "販売期間前です";
    case "after_sales": return "販売期間が終了しました";
    case "before_event": return "イベント当日からご利用いただけます";
    case "after_event": return "決済受付が終了しました";
  }
}
