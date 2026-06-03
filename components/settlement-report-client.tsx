"use client";

import { AlertTriangle, CheckCircle2, Lock, Printer, Shield, TrendingUp } from "lucide-react";
import type { QRGroupRow, DebtClaimRow, EventRecipientRow } from "@/app/[locale]/dashboard/events/[eventId]/settlement/page";

const yen  = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const pct  = (n: number, total: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "—";

const ROLE_LABEL: Record<string, string> = {
  admin: "運営", agent: "エージェント", organizer: "オーガナイザー", artist: "アーティスト",
};

// 配分行のステータス表示
// 凍結 = CBで一部or全部が止まっている（決済単位）
// ホールド = 14日待機中（正常）
// 出金可 = ready
function DistStatus({ d }: { d: { actual_amount: number; frozen_amount: number; hold_released: boolean } }) {
  if (d.frozen_amount === 0) {
    return d.hold_released
      ? <span className="text-xs font-black text-emerald-400 print:text-emerald-700">✅ 出金可</span>
      : <span className="text-xs font-black text-amber-400 print:text-amber-700">⏳ ホールド中</span>;
  }
  if (d.frozen_amount >= d.actual_amount) {
    return <span className="text-xs font-black text-red-400 bg-red-950/50 border border-red-500/30 px-2 py-0.5 rounded-lg print:text-red-600">🔒 全額凍結（CB係争）</span>;
  }
  return (
    <span className="text-xs font-black text-orange-400 print:text-orange-600">
      🔒 一部凍結 {yen(d.frozen_amount)}（CB係争）
    </span>
  );
}

type Props = {
  event: { title: string; venue: string | null; startStr: string };
  reportVersion: string;
  approvedAtStr: string | null;
  lastCbAt: string | null;
  totalGross: number;
  totalStripeFee: number;
  totalPlatformFee: number;
  totalNet: number;
  totalTaxAmount: number;
  eventRecipients: EventRecipientRow[];
  qrGroups: QRGroupRow[];
  debtClaims: DebtClaimRow[];
  activeClaims: DebtClaimRow[];
  cbFeeTotal: number;
  cbFeeShortage: number;
  frozenDistTotal: number;
  totalHold: number;
  riskReports: Array<{ failed_count: number; failed_amount: number; task_name: string; process_date: string }>;
};

export function SettlementReportClient({
  event, reportVersion, approvedAtStr, lastCbAt,
  totalGross, totalStripeFee, totalPlatformFee, totalNet, totalTaxAmount,
  eventRecipients, qrGroups, debtClaims, activeClaims,
  cbFeeTotal, cbFeeShortage, frozenDistTotal, totalHold, riskReports,
}: Props) {
  const hasCb     = activeClaims.length > 0;
  const riskCount = riskReports.reduce((s, r) => s + r.failed_count, 0);
  const totalRisk = riskReports.reduce((s, r) => s + r.failed_amount, 0);
  const versionTs = lastCbAt ? `${lastCbAt} 時点のCBを反映` : approvedAtStr ? `${approvedAtStr} 精算確定` : "精算確定済み";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans print:bg-white print:text-black">
      <div className="max-w-4xl mx-auto px-6 py-10 print:px-8 print:py-6">

        {/* ヘッダー */}
        <div className="flex items-start justify-between mb-8 print:mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-black text-pink-500 uppercase tracking-widest border border-pink-500/30 px-2 py-1 rounded-lg print:text-pink-700 print:border-pink-300">確定精算レポート</span>
              <span className="text-xs font-black text-slate-500">{reportVersion}</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight print:text-black">{event.title}</h1>
            <p className="text-sm text-slate-500 mt-1 print:text-slate-600">{event.startStr}{event.venue ? ` — ${event.venue}` : ""}</p>
            <p className="text-xs text-slate-600 mt-1 print:text-slate-400">{versionTs}</p>
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-white border border-slate-800 hover:border-slate-600 px-3 py-2 rounded-xl transition-all print:hidden">
            <Printer size={14} /> 印刷
          </button>
        </div>

        {/* CB警告 */}
        {hasCb && (
          <div className="bg-red-950/60 border border-red-500/40 rounded-2xl p-5 mb-6 print:bg-red-50 print:border-red-300">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle size={18} className="text-red-400 print:text-red-600" />
              <h2 className="text-sm font-black text-red-300 uppercase tracking-widest print:text-red-700">チャージバック発生 — ホールド中</h2>
              <span className="text-xs font-black text-red-500 bg-red-950/80 border border-red-500/30 px-2 py-0.5 rounded-full print:text-red-600">{activeClaims.length}件</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "凍結額（決済単位）", value: yen(frozenDistTotal), desc: "CB係争中の決済の配分分" },
                { label: "CB手数料（実費）",  value: yen(cbFeeTotal),     desc: "Stripe係争手数料" },
                { label: "決済手数料不足分",  value: yen(cbFeeShortage),  desc: "取消による追加損失" },
              ].map(item => (
                <div key={item.label} className="bg-red-950/40 rounded-xl p-3 print:bg-red-100">
                  <p className="text-xs text-red-500 font-black print:text-red-600">{item.label}</p>
                  <p className="text-xl font-black text-red-300 mt-1 print:text-red-700">{item.value}</p>
                  <p className="text-xs text-red-600 mt-0.5 print:text-red-500">{item.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-red-900/50 flex items-center justify-between print:border-red-200">
              <p className="text-xs text-red-500 flex items-center gap-1 print:text-red-600"><Lock size={12} /> 総ホールド金額</p>
              <p className="text-lg font-black text-red-300 print:text-red-700">{yen(totalHold)}</p>
            </div>
          </div>
        )}

        {/* サマリーカード 4枚 */}
        <div className="grid grid-cols-4 gap-3 mb-8 print:mb-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 print:bg-slate-50 print:border-slate-300">
            <div className="flex items-center gap-1.5 mb-2"><TrendingUp size={12} className="text-slate-600" /><p className="text-xs font-black text-slate-600 print:text-slate-500">総流通額</p></div>
            <p className="text-2xl font-black text-white print:text-black">{yen(totalGross)}</p>
            <p className="text-xs text-slate-600 mt-1 print:text-slate-500">売上合計</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 print:bg-slate-50 print:border-slate-300">
            <div className="flex items-center gap-1.5 mb-2"><Shield size={12} className="text-slate-600" /><p className="text-xs font-black text-slate-600 print:text-slate-500">Stripe決済手数料</p></div>
            <p className="text-2xl font-black text-slate-400 print:text-black">{yen(totalStripeFee)}</p>
            <p className="text-xs text-slate-600 mt-1 print:text-slate-500">{pct(totalStripeFee, totalGross)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 print:bg-slate-50 print:border-slate-300">
            <div className="flex items-center gap-1.5 mb-2"><Shield size={12} className="text-slate-600" /><p className="text-xs font-black text-slate-600 print:text-slate-500">プラットフォーム利用料</p></div>
            <p className="text-2xl font-black text-slate-400 print:text-black">{yen(totalPlatformFee)}</p>
            <p className="text-xs text-slate-600 mt-1 print:text-slate-500">{pct(totalPlatformFee, totalGross)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 print:bg-slate-50 print:border-slate-300">
            <div className="flex items-center gap-1.5 mb-2"><CheckCircle2 size={12} className="text-slate-600" /><p className="text-xs font-black text-slate-600 print:text-slate-500">主催者受取総額</p></div>
            <p className={`text-2xl font-black ${hasCb ? "text-amber-300" : "text-emerald-400"} print:text-black`}>{yen(totalNet)}</p>
            {hasCb && <p className="text-xs text-red-500 mt-0.5 print:text-red-600">うちCB凍結 {yen(totalHold)}</p>}
            {totalTaxAmount > 0 && <p className="text-xs text-slate-600 mt-1 print:text-slate-500">うち消費税 {yen(totalTaxAmount)}</p>}
          </div>
        </div>

        {/* ══ イベント全体 受取人サマリー ══ */}
        <div className="mb-6 print:mb-4">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 print:text-slate-600">
            受取人別 合計（イベント全体）
          </h2>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden print:bg-white print:border-slate-300">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 print:border-slate-200">
                  {["連結アカウント", "ロール", "合計配分額", "うちCB凍結", "振込実績", "状態"].map(h => (
                    <th key={h} className="text-left text-xs font-black text-slate-600 uppercase tracking-widest px-5 py-2 print:text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventRecipients.map(r => (
                  <tr key={r.profile_id} className={`border-b border-slate-800/50 print:border-slate-100 ${r.frozen_amount > 0 ? "bg-red-950/10 print:bg-red-50" : ""}`}>
                    <td className="px-5 py-3 font-bold text-white print:text-black">{r.display_name}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs print:text-slate-600">{ROLE_LABEL[r.role] ?? r.role}</td>
                    <td className="px-5 py-3 font-black text-white text-right print:text-black">{yen(r.total_amount)}</td>
                    <td className="px-5 py-3 text-right">
                      {r.frozen_amount > 0
                        ? <span className="text-red-400 font-bold text-xs print:text-red-600">{yen(r.frozen_amount)}</span>
                        : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-xs">
                      {r.settle_amount != null
                        ? <span className="text-emerald-400 font-bold print:text-emerald-700">{yen(r.settle_amount)}</span>
                        : <span className="text-slate-600">未振込</span>}
                    </td>
                    <td className="px-5 py-3">
                      <DistStatus d={{ actual_amount: r.total_amount, frozen_amount: r.frozen_amount, hold_released: r.settle_amount != null }} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700 print:border-slate-300">
                  <td colSpan={2} className="px-5 py-2 text-xs font-black text-slate-500 print:text-slate-600">合計</td>
                  <td className="px-5 py-2 font-black text-white text-right print:text-black">{yen(eventRecipients.reduce((s, r) => s + r.total_amount, 0))}</td>
                  <td className="px-5 py-2 text-right">
                    {frozenDistTotal > 0 && <span className="text-red-400 font-bold text-xs print:text-red-600">{yen(frozenDistTotal)}</span>}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ══ QR設定別 内訳 ══ */}
        <div className="mb-8 print:mb-6">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 print:text-slate-600">
            QR設定別 内訳
          </h2>
          <div className="space-y-4">
            {qrGroups.map(qr => (
              <div key={qr.qr_config_id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden print:bg-white print:border-slate-300">
                <div className="flex items-center justify-between px-5 py-3 bg-slate-800/60 border-b border-slate-700/50 print:bg-slate-100 print:border-slate-200">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-black text-white print:text-black">{qr.label}</p>
                      <span className="text-xs text-pink-400 font-bold print:text-pink-600">{qr.txCount.toLocaleString()}チア</span>
                    </div>
                    <p className="text-xs text-slate-500 print:text-slate-600">
                      売上 {yen(qr.totalGross)} → Stripe {yen(qr.totalStripeFee)} + PF {yen(qr.totalPlatformFee)} = 配分原資 {yen(qr.totalNet)}
                    </p>
                  </div>
                  {qr.totalTaxAmount > 0 && <p className="text-xs text-slate-500 print:text-slate-600">消費税 {yen(qr.totalTaxAmount)}</p>}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800/70 print:border-slate-200">
                      {["受取人", "ロール", "配分額", "うちCB凍結", "比率", "状態"].map(h => (
                        <th key={h} className="text-left text-xs font-black text-slate-600 px-5 py-2 print:text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {qr.distributions.map(d => (
                      <tr key={d.profile_id} className={`border-b border-slate-800/50 print:border-slate-100 ${d.frozen_amount > 0 ? "bg-red-950/15 print:bg-red-50" : ""}`}>
                        <td className="px-5 py-3 font-bold text-sm text-white print:text-black">{d.display_name}</td>
                        <td className="px-5 py-3 text-slate-400 text-xs print:text-slate-600">{ROLE_LABEL[d.role] ?? d.role}</td>
                        <td className="px-5 py-3 font-black text-right text-white print:text-black">{yen(d.actual_amount)}</td>
                        <td className="px-5 py-3 text-right text-xs">
                          {d.frozen_amount > 0
                            ? <span className="text-red-400 font-bold print:text-red-600">{yen(d.frozen_amount)}</span>
                            : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-5 py-3 text-slate-400 text-xs text-right print:text-slate-600">{pct(d.actual_amount, qr.totalNet)}</td>
                        <td className="px-5 py-3"><DistStatus d={d} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-700 print:border-slate-300">
                      <td colSpan={2} className="px-5 py-2 text-xs font-black text-slate-500 print:text-slate-600">小計</td>
                      <td className="px-5 py-2 font-black text-white text-right print:text-black">{yen(qr.distributions.reduce((s, d) => s + d.actual_amount, 0))}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}
          </div>
        </div>

        {/* CB係争明細 */}
        {debtClaims.filter(c => c.status !== "closed_won").length > 0 && (
          <div className="mb-8 print:mb-6">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 print:text-slate-600">チャージバック係争明細</h2>
            <div className="space-y-3">
              {debtClaims.filter(c => c.status !== "closed_won").map((cb, i) => {
                const isActive = cb.status === "active";
                return (
                  <div key={cb.claim_id} className={`rounded-2xl border p-4 print:bg-white ${isActive ? "bg-red-950/20 border-red-500/30 print:border-red-300" : "bg-slate-900 border-slate-800 print:border-slate-300"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-500">#{i + 1}</span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full border ${isActive ? "text-red-400 bg-red-950/50 border-red-500/30 print:text-red-600" : "text-amber-400 bg-amber-950/30 border-amber-500/30 print:text-amber-700"}`}>
                          {cb.status === "active" ? "係争中" : cb.status === "written_off" ? "敗訴" : "回収済み"}
                        </span>
                        <span className="text-xs text-slate-500 print:text-slate-600">{new Date(cb.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>
                      </div>
                      <span className={`font-black ${isActive ? "text-red-300 print:text-red-700" : "text-slate-400 print:text-slate-600"}`}>{yen(cb.claim_amount)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div><p className="text-slate-600 print:text-slate-500">対象取引</p><p className="text-slate-400 font-mono text-xs print:text-slate-600">{cb.original_transaction_id.slice(0, 16)}…</p></div>
                      <div><p className="text-slate-600 print:text-slate-500">Stripe係争手数料</p><p className="text-red-400 font-bold print:text-red-600">{yen(cb.stripe_dispute_fee ?? 1500)}</p></div>
                      <div><p className="text-slate-600 print:text-slate-500">決済手数料不足分</p><p className="text-amber-400 font-bold print:text-amber-600">{yen(cb.stripe_processing_fee ?? 0)}</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 未回収アラート */}
        {riskCount > 0 && (
          <div className="mb-8 print:mb-6">
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-5 print:bg-amber-50 print:border-amber-300">
              <p className="text-sm font-black text-amber-300 mb-2 print:text-amber-700">⚠️ 要現地回収 {riskCount}件 — {yen(totalRisk)}</p>
              <p className="text-xs text-amber-600 mb-3 print:text-amber-500">残高不足・本人認証未完了等により決済失敗した明細です。現地での別途回収が必要です。</p>
              {riskReports.map(r => (
                <div key={r.task_name + r.process_date} className="flex items-center justify-between text-xs">
                  <span className="text-amber-500 print:text-amber-600">{r.task_name} ({r.process_date})</span>
                  <span className="text-amber-300 font-bold print:text-amber-700">{r.failed_count}件 {yen(r.failed_amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* フッター */}
        <div className="border-t border-slate-800 pt-6 print:border-slate-300">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-700 leading-relaxed print:text-slate-400">
              本レポートはシステムが自動生成した公式確定レポートです。配分額は事前に審査・登録されたルールに従い自動算出されており、手動変更は不可です。
              各決済のチャージバック（異議申し立て）待機期間中に新たなチャージバックが発生した場合、レポートの内容が変更される可能性があります。
            </p>
            <p className="text-xs text-slate-700 ml-6 shrink-0 print:text-slate-400">Direct Cheers {reportVersion}</p>
          </div>
        </div>
      </div>
      <style>{`@media print { @page { size: A4; margin: 15mm; } body { font-size: 11px; } }`}</style>
    </div>
  );
}
