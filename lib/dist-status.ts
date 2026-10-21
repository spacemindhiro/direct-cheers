// 精算レポートの配分行の状態。画面（components/settlement-report-client.tsx）とチアリー(AI) の settlement_report で共用する。
// 凍結 = CBで一部or全部が止まっている（決済単位）／ホールド = 保留期間の待機中（正常）／出金可 = ready
export type DistStatusKind = "ready" | "hold" | "frozen_all" | "frozen_part";

export function distStatus(d: { actual_amount: number; frozen_amount: number; hold_released: boolean }): DistStatusKind {
  if (d.frozen_amount === 0) return d.hold_released ? "ready" : "hold";
  return d.frozen_amount >= d.actual_amount ? "frozen_all" : "frozen_part";
}
