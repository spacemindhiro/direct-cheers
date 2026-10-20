// 売上受取口座の状態。プロフィール画面（app/[locale]/dashboard/profile/page.tsx の「売上受取口座」）の表示条件と同じ：
//   審査完了 — 受取可能 … 口座連携あり かつ verified
//   口座開設審査中      … 口座連携あり かつ pending
//   審査却下            … rejected（連携の有無を問わない）
//   未登録              … それ以外（連携なし、または unverified）＝「口座登録・本人確認を始める」が出る
// verification_status は DB で unverified / pending / verified / rejected の4値に制約されている。
export type BankState = "verified" | "pending" | "rejected" | "not_started";

export function bankState(stripeConnectId: string | null | undefined, verificationStatus: string | null | undefined): BankState {
  if (verificationStatus === "rejected") return "rejected";
  if (!stripeConnectId) return "not_started";
  if (verificationStatus === "verified") return "verified";
  if (verificationStatus === "pending") return "pending";
  return "not_started";
}

export const BANK_STATE_LABEL: Record<BankState, string> = {
  verified: "審査完了 — 受取可能",
  pending: "口座開設審査中（運営による最終承認待ち）",
  rejected: "審査却下（担当エージェントに確認してください。プロフィールから再申請できます）",
  not_started: "未登録（プロフィールの「口座登録・本人確認を始める」から登録できます）",
};
