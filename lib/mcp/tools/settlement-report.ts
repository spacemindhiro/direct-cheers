// settlement_report：精算済みイベントの確定精算レポート（集計は lib/settlement-report.ts を画面と共用）。
//   - 対象は本人が操作できるイベント（../event-pick.ts）のうち精算済みのもの。画面も精算前は開けない
//   - エージェントの配分行と「DC取り分／エージェント」の内訳は、画面と同じく運営と担当エージェントにだけ返す
// 返さないもの：お客様の名前・メッセージ（画面のメッセージ一覧は返さない）・決済ID・内部ID・運営向けのリスク報告
import { z } from "zod";
import { computeSettlementReport } from "@/lib/settlement-report";
import { distStatus } from "@/lib/dist-status";
import type { DcMcpContext } from "../context";
import { pickOperableEvent } from "../event-pick";
import { jstDateTime, lines, yen } from "../format";

export const SETTLEMENT_REPORT = {
  name: "settlement_report",
  minRole: "organizer",
  title: "確定精算レポート",
  description:
    "この人が主催・担当する精算済みイベント1件の確定精算レポートを返す。版・精算日時・売上合計・決済手数料・プラットフォーム手数料・主催者受取総額・受取人ごとの合計配分額と振込実績と状態（出金可／ホールド中／CB凍結）・チャージバックによる保留・QRごとの内訳。イベントは名前の一部で指定する。",
  inputSchema: {
    event: z.string().min(1).max(100).describe("イベント名の一部"),
  },
} as const;

const ROLE_LABEL: Record<string, string> = { admin: "運営", agent: "エージェント", organizer: "オーガナイザー", artist: "アーティスト" };
const STATUS_LABEL = { ready: "出金可", hold: "ホールド中", frozen_all: "全額凍結（CB係争）", frozen_part: "一部凍結（CB係争）" } as const;

export async function settlementReport(ctx: DcMcpContext, input: { event: string }): Promise<string> {
  const found = await pickOperableEvent(ctx, input.event);
  if ("message" in found) return found.message;
  const { data: event } = await ctx.admin
    .from("events")
    .select("event_id, title, start_at, lifecycle_status, agent_id")
    .eq("event_id", found.event.event_id)
    .single();
  if (!event) throw new Error("event");
  if (event.lifecycle_status !== "settled") {
    return `「${event.title}」はまだ精算されていません。確定精算レポートは精算後に表示されます（開催証跡の状況は evidence_status で確認できます）。`;
  }

  const r = await computeSettlementReport(ctx.admin as never, event.event_id);
  // 画面の isInsider と同じ（運営か、このイベントの担当エージェント）
  const isInsider = ctx.role === "admin" || event.agent_id === ctx.userId;
  const visible = <T extends { role: string }>(rows: T[]) => rows.filter((x) => isInsider || x.role !== "agent");
  const agentTotal = r.eventRecipients.filter((x) => x.role === "agent").reduce((s, x) => s + x.total_amount, 0);

  const out = [
    lines(`${event.title} 確定精算レポート（${r.reportVersion}）`, [
      ["開催", jstDateTime(event.start_at)],
      ["精算日時", r.approvedAtStr],
      ["精算後のチャージバック", r.lastCbAt ? `あり（最新 ${r.lastCbAt}）` : null],
      ["売上合計（総流通額）", yen(r.totalGross)],
      ["Stripe決済手数料", yen(r.totalStripeFee)],
      ["プラットフォーム手数料", isInsider ? `${yen(r.totalPlatformFee)}（DC取り分 ${yen(r.totalPlatformFee - agentTotal)} / エージェント ${yen(agentTotal)}）` : yen(r.totalPlatformFee)],
      ["主催者受取総額（配分原資）", yen(r.totalNet)],
      ["うち消費税", r.totalTaxAmount > 0 ? yen(r.totalTaxAmount) : null],
      ["CBによる保留", r.activeClaims.length > 0 ? `${yen(r.totalHold)}（係争中 ${r.activeClaims.length}件。凍結 ${yen(r.frozenDistTotal)}・CB手数料 ${yen(r.cbFeeTotal)}・不足分 ${yen(r.cbFeeShortage)}）` : null],
    ]),
    "受取人別 合計（イベント全体）",
    ...visible(r.eventRecipients).map((x) =>
      `  - ${x.display_name}（${ROLE_LABEL[x.role] ?? x.role}）: 合計配分額 ${yen(x.total_amount)}${x.frozen_amount > 0 ? `・うちCB凍結 ${yen(x.frozen_amount)}` : ""}・振込実績 ${x.settle_amount != null ? yen(x.settle_amount) : "未振込"}・${STATUS_LABEL[distStatus({ actual_amount: x.total_amount, frozen_amount: x.frozen_amount, hold_released: x.hold_released })]}`),
    "QR設定別 内訳",
    ...r.qrGroups.map((g) =>
      `  - ${g.label}: ${g.txCount}チア（計${g.totalQuantity}件）・売上 ${yen(g.totalGross)} → Stripe ${yen(g.totalStripeFee)} + 手数料 ${yen(g.totalPlatformFee)} = 配分原資 ${yen(g.totalNet)}`),
  ];
  return out.join("\n");
}
