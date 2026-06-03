"use client";

import { AlertTriangle, CheckCircle2, Lock, Printer, Shield, Clock } from "lucide-react";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

const CB_STATUS_LABEL: Record<string, { label: string; color: string; printColor: string }> = {
  active:      { label: "係争中",       color: "text-red-400",    printColor: "text-red-600" },
  written_off: { label: "敗訴・損失確定", color: "text-red-500",    printColor: "text-red-700" },
  recovered:   { label: "回収済み",     color: "text-amber-400",  printColor: "text-amber-600" },
};

type Props = {
  event: { event_id: string; title: string; venue: string | null; startStr: string };
  artistName: string;
  reportVersion: string;
  approvedAtStr: string | null;
  totalDistAmount: number;
  frozenDistTotal: number;
  grossHoldTotal: number;
  myCbFeeTotal: number;
  myProcFeeTotal: number;
  totalHold: number;
  confirmedAmount: number;
  settledAmount: number;
  myClaims: Array<{
    claim_id: string; original_transaction_id: string;
    claim_amount: number; stripe_dispute_fee: number | null;
    stripe_processing_fee: number | null; status: string;
    stripe_dispute_id: string | null; created_at: string;
  }>;
  frozenDists: Array<{
    transaction_distribution_id: string; transaction_id: string;
    actual_amount: number; is_frozen: boolean;
    tx: { transaction_id: string; total_gross_amount: number; stripe_fee: number; stripe_payment_intent_id: string } | null;
  }>;
};

export function ArtistSettlementClient({
  event, artistName, reportVersion, approvedAtStr,
  totalDistAmount, frozenDistTotal, grossHoldTotal,
  myCbFeeTotal, myProcFeeTotal, totalHold, confirmedAmount,
  settledAmount, myClaims, frozenDists,
}: Props) {
  const hasCb   = myClaims.length > 0;
  const isClean = totalHold === 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans print:bg-white print:text-black">
      <div className="max-w-3xl mx-auto px-6 py-10 print:px-8 print:py-6">

        {/* ── ヘッダー ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8 print:mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] border border-emerald-500/30 px-2 py-1 rounded-lg print:text-emerald-700 print:border-emerald-300">
                個人精算証明書
              </span>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {reportVersion}
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight print:text-black">
              {event.title}
            </h1>
            <p className="text-sm text-slate-400 mt-0.5 print:text-slate-600">
              {event.startStr}{event.venue ? ` — ${event.venue}` : ""}
            </p>
            <p className="text-xs text-slate-600 mt-1 print:text-slate-400">
              {approvedAtStr ? `精算確定: ${approvedAtStr}` : "精算確定済み"}
            </p>
          </div>
          <div className="text-right">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-white border border-slate-800 hover:border-slate-600 px-3 py-2 rounded-xl transition-all print:hidden"
            >
              <Printer size={14} /> 印刷
            </button>
            <p className="text-xs text-slate-600 mt-2 print:text-slate-500">
              受取人: {artistName}
            </p>
          </div>
        </div>

        {/* ── CB 警告バナー ─────────────────────────────────────────────── */}
        {hasCb && (
          <div className="bg-red-950/60 border border-red-500/40 rounded-2xl p-5 mb-6 print:bg-red-50 print:border-red-300">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-red-400 print:text-red-600" />
              <h2 className="text-sm font-black text-red-300 uppercase tracking-widest print:text-red-700">
                チャージバック発生 — 自身への直接ホールド
              </h2>
              <span className="text-[10px] font-black text-red-500 bg-red-950/80 border border-red-500/30 px-2 py-0.5 rounded-full print:text-red-600">
                {myClaims.length}件
              </span>
            </div>
            <p className="text-xs text-red-600 mb-3 print:text-red-500">
              あなたのConnect口座が宛先となっていた明細でチャージバックが発生しています。
              以下の金額があなたの受取総額からホールド（拘束）されています。
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "明細凍結額",   value: frozenDistTotal, desc: "配分予定額の凍結" },
                { label: "CB手数料",     value: myCbFeeTotal,    desc: "Stripe係争手数料（実費）" },
                { label: "決済手数料不足", value: myProcFeeTotal,  desc: "取消による追加損失" },
              ].map(item => (
                <div key={item.label} className="bg-red-950/40 rounded-xl p-3 print:bg-red-100">
                  <p className="text-[10px] text-red-500 font-black uppercase tracking-widest print:text-red-600">{item.label}</p>
                  <p className="text-lg font-black text-red-300 mt-1 print:text-red-700">{yen(item.value)}</p>
                  <p className="text-[10px] text-red-600 mt-0.5 print:text-red-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 個人サマリーカード ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 mb-8 print:mb-6">
          {[
            {
              label: "分配予定総額",
              value: yen(totalDistAmount),
              sub:   "事前設定ルールによる自動算出",
              color: "text-white",
              icon:  Shield,
            },
            {
              label: "総ホールド（拘束）額",
              value: yen(totalHold),
              sub:   hasCb
                ? `明細凍結 ${yen(frozenDistTotal)} + グロスホールド ${yen(grossHoldTotal)}`
                : "ホールドなし",
              color: hasCb ? "text-red-400" : "text-slate-500",
              icon:  Lock,
            },
            {
              label: "差引・確定受取額",
              value: yen(confirmedAmount),
              sub:   isClean ? "全額確定（ホールドなし）" : "CB解決後に最終確定",
              color: isClean ? "text-emerald-400" : "text-amber-300",
              icon:  CheckCircle2,
            },
            {
              label: "振込実績",
              value: settledAmount > 0 ? yen(settledAmount) : "未振込",
              sub:   settledAmount > 0 ? "Stripe Transfer 完了" : "出金可能になり次第振込",
              color: settledAmount > 0 ? "text-emerald-400" : "text-slate-500",
              icon:  Clock,
            },
          ].map(card => (
            <div
              key={card.label}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 print:bg-slate-50 print:border-slate-300"
            >
              <div className="flex items-center gap-2 mb-2">
                <card.icon size={13} className="text-slate-600 print:text-slate-400" />
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] print:text-slate-500">
                  {card.label}
                </p>
              </div>
              <p className={`text-3xl font-black ${card.color} print:text-black`}>{card.value}</p>
              <p className="text-[10px] text-slate-600 mt-1 print:text-slate-500">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ── CB 係争明細 ───────────────────────────────────────────────── */}
        {myClaims.length > 0 && (
          <div className="mb-8 print:mb-6">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 print:text-slate-600">
              あなたへの直接チャージバック明細
            </h2>
            <div className="space-y-3">
              {myClaims.map((cb, i) => {
                const cbFee = cb.stripe_dispute_fee  ?? 1500;
                const pfFee = cb.stripe_processing_fee ?? 0;
                const st    = CB_STATUS_LABEL[cb.status] ?? { label: cb.status, color: "text-slate-400", printColor: "text-slate-600" };
                return (
                  <div
                    key={cb.claim_id}
                    className="bg-slate-900 border border-red-500/20 rounded-2xl p-4 print:bg-white print:border-red-200"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-500">#{i + 1}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border border-current/30 ${st.color} print:${st.printColor}`}>
                          {st.label}
                        </span>
                        <span className="text-xs text-slate-500 print:text-slate-600">
                          {new Date(cb.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
                        </span>
                      </div>
                      <span className="text-red-400 font-black print:text-red-700">
                        {yen(cb.claim_amount)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-slate-600 print:text-slate-500">対象取引</p>
                        <p className="text-slate-400 font-mono text-[10px] print:text-slate-700">
                          {cb.original_transaction_id.slice(0, 16)}…
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-600 print:text-slate-500">Stripe係争手数料</p>
                        <p className="text-red-400 font-bold print:text-red-600">{yen(cbFee)}</p>
                        <p className="text-[10px] text-slate-600 print:text-slate-500">あなたの取り分から控除</p>
                      </div>
                      <div>
                        <p className="text-slate-600 print:text-slate-500">決済手数料不足分</p>
                        <p className="text-amber-400 font-bold print:text-amber-600">{yen(pfFee)}</p>
                        <p className="text-[10px] text-slate-600 print:text-slate-500">取消による追加損失</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 凍結中の配分明細 ─────────────────────────────────────────── */}
        {frozenDists.length > 0 && (
          <div className="mb-8 print:mb-6">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 print:text-slate-600">
              凍結中の配分明細
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden print:bg-white print:border-slate-300">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 print:border-slate-200">
                    {["取引", "凍結金額", "取引総額", "状態"].map(h => (
                      <th key={h} className="text-left text-[10px] font-black text-slate-600 uppercase tracking-widest px-5 py-3 print:text-slate-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {frozenDists.map(d => (
                    <tr key={d.transaction_distribution_id} className="border-b border-slate-800/50 bg-red-950/10 print:border-slate-100 print:bg-red-50">
                      <td className="px-5 py-3 text-slate-400 font-mono text-[10px] print:text-slate-600">
                        {d.transaction_id.slice(0, 16)}…
                      </td>
                      <td className="px-5 py-3 font-black text-red-400 print:text-red-700">
                        {yen(d.actual_amount)}
                      </td>
                      <td className="px-5 py-3 text-slate-400 text-xs print:text-slate-600">
                        {d.tx ? yen(d.tx.total_gross_amount) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-[10px] font-black text-red-400 flex items-center gap-1 print:text-red-600">
                          <Lock size={10} /> 凍結中
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 免責事項 / フッター ──────────────────────────────────────── */}
        <div className="border-t border-slate-800 pt-6 print:border-slate-200">
          <div className="flex items-start justify-between gap-6">
            <p className="text-[10px] text-slate-700 leading-relaxed print:text-slate-400">
              本書は Direct Cheers が自動生成した個人精算証明書です。
              記載の金額は事前に審査・登録された配分ルールに基づきシステムが自動算出したものであり、
              税務処理・確定申告等の財務エビデンスとしてご使用いただけます。
              他の出演者の情報・イベント総売上等は本書には含まれていません。
              各決済のチャージバック（異議申し立て）待機期間中に新たなチャージバックが発生した場合、記載内容が変更される可能性があります。
            </p>
            <p className="text-[10px] text-slate-700 shrink-0 print:text-slate-400">
              Direct Cheers {reportVersion}
            </p>
          </div>
        </div>

      </div>

      {/* print CSS */}
      <style>{`
        @media print {
          @page { size: A4; margin: 20mm 15mm; }
          body { font-size: 11px; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
