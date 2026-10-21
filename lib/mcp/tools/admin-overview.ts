// admin_overview：運営（admin）向けの DC 全体の「対応待ち」の照会（requirements.md 7.3）。admin 以外には登録しない。
//   条件は各管理画面に揃える：
//   - 口座審査待ち：profiles.verification_status='pending'（ダッシュボードの「審査待ち」・口座審査画面）
//   - 精算待ち：終了した／終了時刻を過ぎた公開中のイベントで未精算（Settlements 画面の対象）を、証跡の提出・差し戻しで分ける
//   - 承認待ち・中止申請中のイベント
//   - 照合：完了した決済（招待以外）のうち、未照合・金額不一致・照合エラー（Reconcile 画面の集計と同じ区分）
//   - 振込の保留：pending_connect_transfers の pending（口座審査画面の「プールされている分配」）
//   - 運営宛ての未読メッセージ・要確認のバッチ報告
// 返さないもの：連絡先・決済ID・Stripe のID・お客様の名前
import { z } from "zod";
import { AUTH_EXPIRE_DAYS } from "@/lib/settlement-deadline";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import type { DcMcpContext } from "../context";
import { jstDateTime, lines, yen } from "../format";

export const ADMIN_OVERVIEW = {
  name: "admin_overview",
  minRole: "admin",
  title: "運営の対応待ち（全体）",
  description:
    "運営（admin）向けに、DC 全体の対応待ちをまとめて返す。口座審査待ち・精算待ちのイベント（精算できる／差し戻し中／証跡未提出、期限切れの有無）・承認待ちと中止申請中のイベント・決済の照合（未照合・金額不一致・照合エラー）・振込の保留・運営宛ての未読メッセージ・要確認のバッチ報告。各項目の対応は管理画面（口座審査・Settlements・Reconcile 等）で行う。",
  inputSchema: {
    detail: z.number().int().min(0).max(10).optional().describe("各区分で名前を挙げる件数（既定5）"),
  },
} as const;

type Ev = { event_id: string; title: string; start_at: string | null; end_at: string | null; lifecycle_status: string; agent_id: string | null; organizer_profile_id: string };

export async function adminOverview(ctx: DcMcpContext, input: { detail?: number }): Promise<string> {
  if (ctx.role !== "admin") throw new Error("forbidden"); // 登録の段階で除いているが、念のため
  const n = input.detail ?? 5;
  const now = ctx.now ?? new Date();
  const a = ctx.admin;
  const head = (table: string) => a.from(table).select("*", { count: "exact", head: true });

  // 精算待ち（Settlements 画面の対象のうち未精算）
  const unsettled = await fetchAllPages<Ev>(a as never, "events", "event_id, title, start_at, end_at, lifecycle_status, agent_id, organizer_profile_id",
    (q) => q.is("deleted_at", null).or(`lifecycle_status.eq.ended,and(lifecycle_status.in.(published,ongoing),end_at.lt.${now.toISOString()})`).order("end_at", { ascending: true }));
  const ids = unsettled.map((e) => e.event_id);
  const withEvidence = new Set<string>();
  const rejected = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [{ data: ev }, { data: rj }] = await Promise.all([
      a.from("event_evidences").select("event_id").in("event_id", chunk),
      a.from("settlement_summaries").select("event_id").in("event_id", chunk).eq("is_approved_for_payout", false),
    ]);
    for (const r of ev ?? []) withEvidence.add(r.event_id as string);
    for (const r of rj ?? []) rejected.add(r.event_id as string);
  }
  const due = (e: Ev) => e.start_at ? new Date(new Date(e.start_at).getTime() + AUTH_EXPIRE_DAYS * 86400e3) : null;
  const daysLeft = (e: Ev) => { const d = due(e); return d ? Math.ceil((d.getTime() - now.getTime()) / 86400e3) : null; };
  const label = (e: Ev) => { const d = daysLeft(e); return `${e.title}（期限 ${jstDateTime(due(e)?.toISOString())}・${d === null ? "期限不明" : d >= 0 ? `あと${d}日` : "期限切れ"}）`; };
  const ready = unsettled.filter((e) => withEvidence.has(e.event_id) && !rejected.has(e.event_id));
  const back = unsettled.filter((e) => rejected.has(e.event_id));
  const noEvidence = unsettled.filter((e) => !withEvidence.has(e.event_id));
  const overdue = unsettled.filter((e) => (daysLeft(e) ?? 0) < 0);

  const [review, cancelReq, verify, unreadMsgs, riskReports, transfers] = await Promise.all([
    a.from("events").select("title, agent_id, organizer_profile_id").is("deleted_at", null).eq("lifecycle_status", "review_requested"),
    a.from("events").select("title").is("deleted_at", null).eq("lifecycle_status", "cancellation_requested"),
    a.from("profiles").select("display_name, organizer_name, artist_name", { count: "exact" }).eq("verification_status", "pending").is("deleted_at", null).limit(n),
    head("admin_messages").eq("is_from_admin", false).eq("is_read_by_admin", false),
    head("daily_business_reports").eq("status", "要確認・未回収あり"),
    fetchAllPages<{ amount: number | null }>(a as never, "pending_connect_transfers", "amount", (q) => q.eq("status", "pending")),
  ]);
  const txBase = () => head("transactions").eq("status", "completed").neq("transaction_type", "invitation");
  const [{ count: unreconciled }, { count: mismatch }, { count: reconcileErr }] = await Promise.all([
    txBase().is("reconciled_at", null),
    txBase().eq("amount_verified", false),
    txBase().not("reconcile_error", "is", null),
  ]);

  const names = <T,>(rows: T[], f: (r: T) => string) => rows.slice(0, n).map((r) => `    ・${f(r)}`);
  const reviewRows = (review.data ?? []) as { title: string; agent_id: string | null; organizer_profile_id: string }[];
  const selfOrganized = reviewRows.filter((e) => e.agent_id === e.organizer_profile_id);
  const transferTotal = transfers.reduce((s, t) => s + (t.amount ?? 0), 0);

  return [
    `運営の対応待ち（${jstDateTime(now.toISOString())} 時点）`,
    "口座審査",
    `  - 審査待ち: ${verify.count ?? 0}人`,
    ...names((verify.data ?? []) as { display_name: string | null; organizer_name: string | null; artist_name: string | null }[], (p) => p.organizer_name ?? p.artist_name ?? p.display_name ?? "（名前未設定）"),
    "精算待ちのイベント（終了済み・未精算）",
    `  - 合計: ${unsettled.length}件（うち期限切れ ${overdue.length}件）`,
    `  - 精算できる（証跡あり・差し戻しなし）: ${ready.length}件`,
    ...names(ready, label),
    `  - 差し戻し中: ${back.length}件`,
    ...names(back, label),
    `  - 証跡が未提出: ${noEvidence.length}件`,
    ...names(noEvidence, label),
    lines("イベントの承認・中止", [
      ["承認待ち", `${reviewRows.length}件（うち自主開催＝運営の承認が必要 ${selfOrganized.length}件）`],
      ["中止申請中", `${cancelReq.data?.length ?? 0}件`],
    ]),
    ...names(selfOrganized, (e) => `${e.title}（自主開催）`),
    ...names((cancelReq.data ?? []) as { title: string }[], (e) => `${e.title}（中止申請中）`),
    lines("決済の照合（完了した決済・招待以外）", [
      ["未照合", `${unreconciled ?? 0}件`],
      ["金額不一致", `${mismatch ?? 0}件`],
      ["照合エラー", `${reconcileErr ?? 0}件`],
    ]),
    lines("その他", [
      ["振込の保留（口座未完了などで送れていない分配）", `${transfers.length}件 ${yen(transferTotal)}`],
      ["運営宛ての未読メッセージ", `${unreadMsgs.count ?? 0}件`],
      ["要確認のバッチ報告", `${riskReports.count ?? 0}件`],
    ]),
  ].join("\n");
}
