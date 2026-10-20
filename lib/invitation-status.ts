// 会員招待の状態の見せ方。招待管理画面（components/invitations-list.tsx）とチアリー(AI) の my_invitations で共用する。
export type InvitationStatusInput = {
  status: string;
  expires_at: string;
  viewed_at: string | null;
  accepted_by: { display_name: string | null } | null;
};

export type InvitationStatusLabel = "受諾済み・ログイン可" | "受諾済み" | "期限切れ" | "閲覧済み" | "未開封";

export function invitationStatusLabel(inv: InvitationStatusInput, now: Date = new Date()): InvitationStatusLabel {
  if (inv.status === "accepted") return inv.accepted_by ? "受諾済み・ログイン可" : "受諾済み";
  if (inv.status === "expired" || new Date(inv.expires_at) < now) return "期限切れ";
  if (inv.viewed_at) return "閲覧済み";
  return "未開封";
}
