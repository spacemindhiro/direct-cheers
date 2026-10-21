// agent_organizers：担当している主催者（profiles.responsible_agent_id が本人）の一覧と状態。
//   - 範囲はイベント作成画面の「代理作成できる主催者」と同じ（エージェントは自分が担当の主催者、admin は担当のいる主催者すべて）
//   - 各主催者の登録状況・口座の状態・開催実績は、照会画面の詳細（lib/directory.ts の getDirectoryProfile）で
//     エージェント・運営が見られる範囲と同じものを使う
// 返さないもの：連絡先（メールアドレス・電話）・Stripe のアカウントID・内部ID
import { z } from "zod";
import { getDirectoryProfile, REGISTRATION_STATUS_LABEL, VERIFICATION_STATUS_LABEL } from "@/lib/directory";
import type { DcMcpContext } from "../context";
import { LIFECYCLE_LABEL, jstDateTime, lines } from "../format";

export const AGENT_ORGANIZERS = {
  name: "agent_organizers",
  minRole: "agent",
  title: "担当している主催者",
  description:
    "この人（エージェント）が担当している主催者の一覧を返す（admin は担当エージェントのいる主催者すべて）。主催者名・団体名・登録状況（Stripe未完了／規約未同意／面談待ち／承認済み）・口座の登録と審査・Stripe制限・残高凍結・チャージバック件数・開催実績の件数と直近のイベント。",
  inputSchema: {
    limit: z.number().int().min(1).max(30).optional().describe("返す件数（既定15）"),
  },
} as const;

export async function agentOrganizers(ctx: DcMcpContext, input: { limit?: number }): Promise<string> {
  const limit = input.limit ?? 15;
  let q = ctx.admin
    .from("profiles")
    .select("profile_id, display_name, organizer_name", { count: "exact" })
    .eq("role", "organizer")
    .not("responsible_agent_id", "is", null)
    .is("deleted_at", null);
  if (ctx.role !== "admin") q = q.eq("responsible_agent_id", ctx.userId);
  const { data, count, error } = await q;
  if (error) throw new Error("organizers");
  const rows = (data ?? [])
    .map((o) => ({ id: o.profile_id as string, name: (o.organizer_name ?? o.display_name ?? "（名前未設定）") as string }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja") || a.id.localeCompare(b.id));
  if (rows.length === 0) return "担当している主催者はいません。";

  const shown = rows.slice(0, limit);
  const body: string[] = [];
  for (const [i, o] of shown.entries()) {
    const p = await getDirectoryProfile(ctx.admin, { viewerRole: ctx.role, profileId: o.id });
    const inn = p?.internal;
    const latest = inn?.hosted_events[0];
    body.push(lines(`${i + 1}. ${o.name}`, [
      ["団体名", p?.organization_name || null],
      ["登録状況", inn ? REGISTRATION_STATUS_LABEL[inn.registration_status] ?? inn.registration_status : null],
      ["口座登録", inn ? (inn.account.has_connect_account ? "登録あり" : "未登録") : null],
      ["口座審査", inn ? VERIFICATION_STATUS_LABEL[inn.account.verification_status] ?? VERIFICATION_STATUS_LABEL.unverified : null],
      ["Stripe制限", inn?.account.stripe_restricted ? "制限あり" : null],
      ["残高凍結", inn?.account.balance_frozen ? "凍結中" : null],
      ["チャージバック", inn && inn.account.chargeback_count > 0 ? `${inn.account.chargeback_count}件` : null],
      ["開催実績", inn ? `${inn.hosted_events.length}件` : null],
      ["直近の開催", latest ? `${latest.title}（${jstDateTime(latest.start_at)}・${LIFECYCLE_LABEL[latest.lifecycle_status] ?? latest.lifecycle_status}）` : null],
    ]));
  }
  return [`担当している主催者 ${count ?? rows.length}人（${shown.length}人を表示）`, ...body].join("\n");
}
