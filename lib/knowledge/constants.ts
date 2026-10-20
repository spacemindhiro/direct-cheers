// 本文の {{KEY}} に差し込む値。数字は案内文に直書きせず、コードの定数から取る
// （仕様変更でコードの値が変わったら、ヘルプとチアリー(AI)の案内も自動で追従させるため）。
import { HOLD_DAYS, FEE_WAIVER_DAYS, TRANSFER_FEE, FREE_POOL_MONTHLY_LIMIT } from "@/lib/payout-config";
import { AUTH_EXPIRE_DAYS, AUTH_EXPIRE_WARN_DAYS_BEFORE } from "@/lib/settlement-deadline";
import { POST_EVENT_GRACE_MS } from "@/lib/purchase-window";

// 14日 →「2週間（14日）」のように、週で割り切れるときは週も添える
function period(days: number): string {
  return days % 7 === 0 ? `${days / 7}週間（${days}日）` : `${days}日`;
}

export const KNOWLEDGE_CONSTANTS: Record<string, string> = {
  HOLD_PERIOD: period(HOLD_DAYS),
  TRANSFER_FEE: TRANSFER_FEE.toLocaleString("ja-JP"),
  FEE_WAIVER_DAYS: String(FEE_WAIVER_DAYS),
  FREE_POOL_MONTHLY_LIMIT: String(FREE_POOL_MONTHLY_LIMIT),
  AUTH_EXPIRE_DAYS: String(AUTH_EXPIRE_DAYS),
  AUTH_EXPIRE_WARN_DAYS_BEFORE: String(AUTH_EXPIRE_WARN_DAYS_BEFORE),
  // 警告が出始める日（開始から何日目か）
  AUTH_EXPIRE_WARN_DAY: String(AUTH_EXPIRE_DAYS - AUTH_EXPIRE_WARN_DAYS_BEFORE),
  // 当日決済をイベント終了後いつまで受け付けるか
  POST_EVENT_GRACE_HOURS: String(POST_EVENT_GRACE_MS / (60 * 60 * 1000)),
};
