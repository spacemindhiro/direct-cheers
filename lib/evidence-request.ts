// 開催証跡の提出依頼・催促（app/api/cron/evidence-request）とその表示（ダッシュボード）で共有する決まりごと。
//
// - 依頼：締め時刻（終了3時間後＝当日決済の受付終了。lib/purchase-window.ts）を過ぎたら
// - 催促：精算期限の2日前（開始＋5日）にまだ未提出なら
// - 送り先：主催者に「提出依頼」、担当エージェントに「フォロー依頼」。
//   エージェント自身が主催するイベントは、主催者としてのエージェントに提出依頼、admin にフォロー依頼
// - 精算期限：開始＋7日。過ぎると未精算の自動キャンセル（app/api/cron/auto-cancel-unsettled）で全決済が取り消される

/** 精算期限（開始からの日数）。app/api/cron/auto-cancel-unsettled の AUTH_EXPIRE_DAYS と同じ値 */
export const SETTLEMENT_DEADLINE_DAYS = 7;
/** 催促は期限の何日前か。app/api/admin/check-auth-expiry の WARN_DAYS_BEFORE と同じ値 */
export const EVIDENCE_REMINDER_DAYS_BEFORE = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export function settlementDeadline(eventStartAt: string | Date): Date {
  return new Date(new Date(eventStartAt).getTime() + SETTLEMENT_DEADLINE_DAYS * DAY_MS);
}

export function evidenceReminderAt(eventStartAt: string | Date): Date {
  return new Date(settlementDeadline(eventStartAt).getTime() - EVIDENCE_REMINDER_DAYS_BEFORE * DAY_MS);
}

/** notifications.type。送信済みの記録（二重送信の防止）もこの行で兼ねる */
export const EVIDENCE_NOTIFICATION = {
  request: "evidence_request",                // 主催者へ：提出依頼
  requestFollow: "evidence_request_follow",   // 担当エージェント（自主催は admin）へ：フォロー依頼
  reminder: "evidence_reminder",              // 主催者へ：期限間近の催促
  reminderFollow: "evidence_reminder_follow", // 担当エージェント（自主催は admin）へ：期限間近のフォロー依頼
} as const;

export const EVIDENCE_NOTIFICATION_TYPES = Object.values(EVIDENCE_NOTIFICATION);
