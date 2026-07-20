export type DrinkBulkTier = { min_quantity: number; unit_price: number };

/**
 * まとめ買い割引ティアから、指定杯数に適用される単価を求める。
 * tiers は min_quantity 昇順（保存時に検証済み）で、条件を満たす最後の段階を採用する。
 * クライアント（表示用）とサーバー（決済金額の確定計算）の両方から使う、
 * 金額計算の唯一の実装。
 */
export function resolveDrinkUnitPrice(
  baseUnitPrice: number,
  bulkPricing: DrinkBulkTier[] | null | undefined,
  quantity: number,
): number {
  let price = baseUnitPrice;
  for (const t of bulkPricing ?? []) {
    if (quantity >= t.min_quantity) price = t.unit_price;
  }
  return price;
}
