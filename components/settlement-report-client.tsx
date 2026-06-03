"use client";

import { AlertTriangle, CheckCircle2, Clock, Download, Printer, Shield, TrendingUp, Lock, AlertCircle, ChevronRight } from "lucide-react";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const pct = (n: number, total: number) =>
  total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "—";

const ROLE_LABEL: Record<string, string> = {
  admin: "運営", agent: "エージェント", organizer: "オーガナイザー", artist: "アーティスト",
};

type Props = {
  event: {
    event_id: string; title: string; venue: string | null;
    lifecycle_status: string; startStr: string;
  };
  reportVersion: string;
  approvedAt: string | null;
  lastCbAt: string | null;
  totalGross: number;
  totalStripeFee: number;
  totalPlatformFee: number;
  totalNet: number;
  distributions: Array<{
    profile_id: string; display_name: string; role: string;
    actual_amount: number; is_frozen: boolean; hold_released: boolean;
    distribution_status: string; settle_amount: number | null;
  }>;
  debtClaims: Array<{
    claim_id: string; original_transaction_id: string;
    claim_amount: number; stripe_dispute_fee: number | null;
    stripe_processing_fee: number | null; status: string;
    stripe_dispute_id: string | null; created_at: string;
  }>;
  activeClaims: Array<{
    claim_id: string; original_transaction_id: string;
    claim_amount: number; stripe_dispute_fee: number | null;
    stripe_processing_fee: number | null; status: string;
    stripe_dispute_id: string | null; created_at: string;
  }>;
  cbFeeTotal: number;
  cbFeeShortage: number;
  frozenDistTotal: number;
  totalHold: number;
  riskReports: Array<{ failed_count: number; failed_amount: number; task_name: string; process_date: string }>;
  txCount: number;
};

export function SettlementReportClient(props: any) {
  const {
    event, reportVersion, approvedAt, lastCbAt,
    totalGross, totalStripeFee, totalPlatformFee, totalNet,
    distributions, debtClaims, activeClaims,
    cbFeeTotal, cbFeeShortage, frozenDistTotal, totalHold,
    riskReports, txCount,
  } = props;

  const hasChargebacks = activeClaims.length > 0;
  const totalRisk = riskReports.reduce((s: number, r: any) => s + r.failed_amount, 0);
  const riskCount = riskReports.reduce((s: number, r: any) => s + r.failed_count, 0);

  const versionTimestamp = lastCbAt
    ? `${lastCbAt} 時点のチャージバックを反映`
    : approvedAt
      ? `${approvedAt} 精算確定`
      : "精算確定済み";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans print:bg-white print:text-black">
      <div className="max-w-4xl mx-auto px-6 py-10 print:px-8 print:py-6">

        {/* ── ヘッダー ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8 print:mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em] border border-pink-500/30 px-2 py-1 rounded-lg print:text-pink-700 print:border-pink-300">
                確定精算レポート
              </span>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {reportVersion}
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight print:text-black">
              {event.title}
            </h1>
            <p className="text-sm text-slate-500 mt-1 print:text-slate-700">
              {event.startStr}{event.venue ? ` — ${event.venue}` : ""}
            </p>
            <p className="text-xs text-slate-600 mt-1 print:text-slate-500">
              {versionTimestamp}
            </p>
          </div>
          <div className="flex items-center gap-3 print:hidden">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-white border border-slate-800 hover:border-slate-600 px-3 py-2 rounded-xl transition-all"
            >
              <Printer size={14} />
              印刷
            </button>
          </div>
        </div>

        {/* ── CB 警告バナー ─────────────────────────────────────────────── */}
        {hasChargebacks && (
          <div className="bg-red-950/60 border border-red-500/40 rounded-2xl p-5 mb-6 print:bg-red-50 print:border-red-300">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle size={18} className="text-red-400 print:text-red-600" />
              <h2 className="text-sm font-black text-red-300 uppercase tracking-widest print:text-red-700">
                チャージバック発生 — ホールド中
              </h2>
              <span className="text-[10px] font-black text-red-500 bg-red-950/80 border border-red-500/30 px-2 py-0.5 rounded-full print:text-red-600">
                係争中 {activeClaims.length}件
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "凍結分配金", value: yen(frozenDistTotal), desc: "各配分先の分配予定額" },
                { label: "CB手数料（実費）", value: yen(cbFeeTotal), desc: "Stripe係争手数料" },
                { label: "決済手数料不足分", value: yen(cbFeeShortage), desc: "取消による追加損失" },
              ].map(item => (
                <div key={item.label} className="bg-red-950/40 rounded-xl p-3 print:bg-red-100">
                  <p className="text-[10px] text-red-500 font-black uppercase tracking-widest print:text-red-600">{item.label}</p>
                  <p className="text-xl font-black text-red-300 mt-1 print:text-red-700">{item.value}</p>
                  <p className="text-[10px] text-red-600 mt-0.5 print:text-red-500">{item.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-red-900/50 flex items-center justify-between print:border-red-200">
              <p className="text-xs text-red-500 print:text-red-600">
                <Lock size={12} className="inline mr-1" />
                総ホールド金額
              </p>
              <p className="text-lg font-black text-red-300 print:text-red-700">{yen(totalHold)}</p>
            </div>
          </div>
        )}

        {/* ── サマリーカード ────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 mb-8 print:mb-6">
          {[
            { label: "総流通額（売上合計）", value: yen(totalGross), sub: `${txCount}件の決済`, color: "text-white", icon: TrendingUp },
            { label: "システム利用料", value: yen(totalStripeFee + totalPlatformFee), sub: `Stripe ${pct(totalStripeFee, totalGross)} + プラットフォーム ${pct(totalPlatformFee, totalGross)}`, color: "text-slate-400", icon: Shield },
            { label: "加盟店受取総額", value: yen(totalNet), sub: `${pct(totalNet, totalGross)} / 内ホールド ${yen(totalHold)}`, color: hasChargebacks ? "text-amber-300" : "text-emerald-400", icon: CheckCircle2 },
          ].map(card => (
            <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 print:bg-slate-50 print:border-slate-300">
              <div className="flex items-center gap-2 mb-3">
                <card.icon size={14} className="text-slate-600 print:text-slate-400" />
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] print:text-slate-500">{card.label}</p>
              </div>
              <p className={`text-3xl font-black ${card.color} print:text-black`}>{card.value}</p>
              <p className="text-[10px] text-slate-600 mt-1 print:text-slate-500">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ── 消費税明細 ───────────────────────────────────────────────── */}
        {(props as any).totalTaxAmount > 0 && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl px-5 py-4 mb-8 print:mb-6 print:bg-slate-50 print:border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1 print:text-slate-600">
                  消費税額（明細合計）
                </p>
                <p className="text-xs text-slate-600 print:text-slate-500">
                  各配分明細に計上された消費税の合計です。Direct Cheers は免税事業者のため消費税の請求・納付は行いません。受取側がインボイス登録事業者の場合は申告の際にご参照ください。
                </p>
              </div>
              <div className="text-right ml-6 shrink-0">
                <p className="text-2xl font-black text-slate-300 print:text-black">
                  {yen((props as any).totalTaxAmount)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── 配分明細 ─────────────────────────────────────────────────── */}
        <div className="mb-8 print:mb-6">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 print:text-slate-600">
            事前設定ルールに基づく自動配分結果
          </h2>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden print:bg-white print:border-slate-300">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 print:border-slate-200">
                  {["連結アカウント", "ロール", "配分金額", "配分比率", "振込実績", "ステータス"].map(h => (
                    <th key={h} className="text-left text-[10px] font-black text-slate-600 uppercase tracking-widest px-5 py-3 print:text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {distributions.map((d: any) => {
                  const isFrozen = d.is_frozen;
                  return (
                    <tr key={d.profile_id} className={`border-b border-slate-800/50 print:border-slate-100 ${isFrozen ? "bg-red-950/20 print:bg-red-50" : ""}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {isFrozen && <Lock size={12} className="text-red-400 shrink-0 print:text-red-600" />}
                          <span className={`font-bold ${isFrozen ? "text-red-300 print:text-red-700" : "text-white print:text-black"}`}>
                            {d.display_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-400 text-xs print:text-slate-600">
                        {ROLE_LABEL[d.role] ?? d.role}
                      </td>
                      <td className="px-5 py-4 font-black text-right">
                        <span className={isFrozen ? "text-red-400 print:text-red-600" : "text-white print:text-black"}>
                          {yen(d.actual_amount)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-400 text-xs text-right print:text-slate-600">
                        {pct(d.actual_amount, totalNet)}
                      </td>
                      <td className="px-5 py-4 text-right text-xs print:text-black">
                        {d.settle_amount != null
                          ? <span className="text-emerald-400 font-bold print:text-emerald-700">{yen(d.settle_amount)}</span>
                          : <span className="text-slate-600">未振込</span>}
                      </td>
                      <td className="px-5 py-4">
                        {isFrozen ? (
                          <span className="text-[10px] font-black text-red-400 bg-red-950/50 border border-red-500/30 px-2 py-1 rounded-lg print:text-red-600">
                            🔒 凍結中
                          </span>
                        ) : d.hold_released ? (
                          <span className="text-[10px] font-black text-emerald-400 print:text-emerald-700">
                            ✅ 出金可
                          </span>
                        ) : (
                          <span className="text-[10px] font-black text-amber-400 print:text-amber-700">
                            ⏳ ホールド
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700 print:border-slate-300">
                  <td colSpan={2} className="px-5 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest print:text-slate-600">
                    合計
                  </td>
                  <td className="px-5 py-4 font-black text-white text-right print:text-black">
                    {yen(distributions.reduce((s: number, d: any) => s + d.actual_amount, 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── CB 明細 ──────────────────────────────────────────────────── */}
        {debtClaims.length > 0 && (
          <div className="mb-8 print:mb-6">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 print:text-slate-600">
              チャージバック係争明細
            </h2>
            <div className="space-y-3">
              {debtClaims.map((cb: any, i: number) => {
                const cbFee  = cb.stripe_dispute_fee  ?? 1500;
                const pfFee  = cb.stripe_processing_fee ?? 0;
                const isActive = cb.status !== "closed_won";
                return (
                  <div key={cb.claim_id} className={`rounded-2xl border p-4 print:bg-white ${isActive ? "bg-red-950/20 border-red-500/30 print:border-red-300" : "bg-slate-900 border-slate-800 print:border-slate-300"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-500 print:text-slate-600">#{i + 1}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${isActive ? "text-red-400 bg-red-950/50 border-red-500/30 print:text-red-600" : "text-emerald-400 bg-emerald-950/30 border-emerald-500/30 print:text-emerald-700"}`}>
                          {cb.status === "active"     ? "係争中"
                        : cb.status === "written_off" ? "敗訴・損失確定"
                        : cb.status === "recovered"   ? "回収済み"
                        : "解決済み"}
                        </span>
                        <span className="text-xs text-slate-500 print:text-slate-600">
                          {new Date(cb.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
                        </span>
                      </div>
                      <span className={`font-black ${isActive ? "text-red-300 print:text-red-700" : "text-slate-400 print:text-slate-600"}`}>
                        {yen(cb.claim_amount)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-slate-600 print:text-slate-500">対象取引</p>
                        <p className="text-slate-300 font-mono text-[10px] print:text-slate-700">{cb.original_transaction_id.slice(0, 16)}…</p>
                      </div>
                      <div>
                        <p className="text-slate-600 print:text-slate-500">Stripe係争手数料</p>
                        <p className="text-red-400 font-bold print:text-red-600">{yen(cbFee)}</p>
                      </div>
                      <div>
                        <p className="text-slate-600 print:text-slate-500">決済手数料不足分</p>
                        <p className="text-amber-400 font-bold print:text-amber-600">{yen(pfFee)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 財務リスク・未回収アラート ─────────────────────────────── */}
        {riskCount > 0 && (
          <div className="mb-8 print:mb-6">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 print:text-slate-600">
              財務リスク・未回収アラート
            </h2>
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-5 print:bg-amber-50 print:border-amber-300">
              <div className="flex items-center gap-3 mb-3">
                <AlertCircle size={16} className="text-amber-400 print:text-amber-600" />
                <p className="text-sm font-black text-amber-300 print:text-amber-700">
                  要現地回収 {riskCount}件 — 合計 {yen(totalRisk)}
                </p>
              </div>
              <p className="text-xs text-amber-600 mb-3 print:text-amber-500">
                残高不足・本人認証未完了等により決済失敗した明細です。配分対象から除外されており、現地での別途回収が必要です。
              </p>
              <div className="space-y-2">
                {riskReports.map((r: any) => (
                  <div key={r.task_name + r.process_date} className="flex items-center justify-between text-xs">
                    <span className="text-amber-500 print:text-amber-600">{r.task_name} ({r.process_date})</span>
                    <span className="text-amber-300 font-bold print:text-amber-700">{r.failed_count}件 {yen(r.failed_amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── フッター ─────────────────────────────────────────────────── */}
        <div className="border-t border-slate-800 pt-6 print:border-slate-300">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-700 print:text-slate-500">
              本レポートはシステムが自動生成した公式確定レポートです。配分額は事前に審査・登録されたルールに従い自動算出されており、手動変更は不可です。
              各決済のチャージバック（異議申し立て）待機期間中に新たなチャージバックが発生した場合、レポートの内容が変更される可能性があります。
            </p>
            <p className="text-[10px] text-slate-700 print:text-slate-500 ml-6 shrink-0">
              Direct Cheers {reportVersion}
            </p>
          </div>
        </div>

      </div>

      {/* print CSS */}
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { font-size: 11px; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
