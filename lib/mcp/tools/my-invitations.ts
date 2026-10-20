// my_invitations：本人が発行した会員招待の状況（招待管理画面と同じ範囲：自分が発行・削除していない・新しい順に最大50件）。
// 会員招待を出せるのはオーガナイザー以上（招待管理画面・/api/invitations の権限と同じ）。
// 返さないもの：招待リンクのトークン（持っていれば誰でも登録できるため）・相手のメールアドレス・内部ID
import { z } from "zod";
import { invitationStatusLabel } from "@/lib/invitation-status";
import type { DcMcpContext } from "../context";
import { jstDateTime, lines } from "../format";

export const MY_INVITATIONS = {
  name: "my_invitations",
  minRole: "organizer",
  title: "発行した会員招待",
  description:
    "この人が発行した会員招待（新規にアーティスト・オーガナイザー等として招く招待）を新しい順に返す。招待したロール・相手（受諾済みなら名前）・状態（未開封／閲覧済み／受諾済み／期限切れ）・発行日・有効期限・送信済みの印。出演依頼の状況は my_lineups ではなく event_detail を使う。",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("返す件数（既定20）"),
  },
} as const;

const ROLE_LABELS: Record<string, string> = { agent: "エージェント", organizer: "オーガナイザー", artist: "アーティスト / DJ" };

type Row = {
  target_role: string;
  target_email: string | null;
  status: string;
  is_sent: boolean | null;
  viewed_at: string | null;
  expires_at: string;
  created_at: string;
  accepted_by: { display_name: string | null } | null;
  target_profile: { display_name: string | null } | null;
};

export async function myInvitations(ctx: DcMcpContext, input: { limit?: number }): Promise<string> {
  const limit = input.limit ?? 20;
  const { data, error } = await ctx.admin
    .from("invitations")
    .select("target_role, target_email, status, is_sent, viewed_at, expires_at, created_at, accepted_by:profiles!accepted_by_profile_id(display_name), target_profile:profiles!target_profile_id(display_name)")
    .eq("invited_by_profile_id", ctx.userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("invitations");
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return "発行した会員招待はありません。";

  const now = ctx.now ?? new Date();
  const counts = new Map<string, number>();
  for (const r of rows) {
    const label = invitationStatusLabel(r, now);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const shown = rows.slice(0, limit);
  const body = shown.map((r, i) => {
    const name = r.accepted_by?.display_name ?? r.target_profile?.display_name;
    return lines(`${i + 1}. ${ROLE_LABELS[r.target_role] ?? r.target_role}として招待`, [
      ["相手", name ?? (r.target_email ? "メールアドレスで招待（宛先は招待管理画面で確認）" : "宛先なし（リンクのみ）")],
      ["状態", invitationStatusLabel(r, now)],
      ["発行", jstDateTime(r.created_at)],
      ["有効期限", jstDateTime(r.expires_at)],
      ["送信済みの印", r.is_sent ? "あり" : "なし"],
    ]);
  });
  const summary = [...counts].map(([k, v]) => `${k} ${v}件`).join("・");
  return [`発行した会員招待 ${rows.length}件（${summary}。${shown.length}件を表示）`, ...body].join("\n");
}
