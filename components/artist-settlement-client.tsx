"use client";

import { AlertTriangle, CheckCircle2, Clock, Lock, Printer, Shield } from "lucide-react";
import type { ArtistQRGroup } from "@/app/[locale]/dashboard/events/[eventId]/artist-settlement/page";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const pctStr = (r: number) => `${(r * 100).toFixed(1)}%`;

const CB_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:      { label: "係争中",       color: "text-red-400"   },
  written_off: { label: "敗訴・損失確定", color: "text-red-500"   },
  recovered:   { label: "回収済み",     color: "text-amber-400" },
};

type Props = {
  event: { title: string; venue: string | null; startStr: string };
  artistName: string;
  reportVersion: string;
  approvedAtStr: string | null;
  totalDistAmount: number;
  totalTaxAmount: number;
  frozenDistTotal: number;   // CBで凍結中の金額（totalDistAmountの内数）
  myCbFeeTotal: number;
  myProcFeeTotal: number;
  cbHoldTotal: number;       // frozenDistTotal + CB手数料（合計拘束額）
  settledAmount: number;
  qrGroups: ArtistQRGroup[];
  myClaims: Array<{
    claim_id: string; original_transaction_id: string;
    claim_amount: number; stripe_dispute_fee: number | null;
    stripe_processing_fee: number | null; status: string;
    stripe_dispute_id: string | null; created_at: string;
  }>;
};

export function ArtistSettlementClient({
  event, artistName, reportVersion, approvedAtStr,
  totalDistAmount, totalTaxAmount, frozenDistTotal,
  myCbFeeTotal, myProcFeeTotal, cbHoldTotal,
  settledAmount, qrGroups, myClaims,
}: Props) {
  const hasCb = myClaims.length > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans print:bg-white print:text-black">
      <div className="max-w-3xl mx-auto px-6 py-10 print:px-8 print:py-6">

        {/* ヘッダー */}
        <div className="flex items-start justify-between mb-8 print:mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-black text-emerald-500 uppercase tracking-widest border border-emerald-500/30 px-2 py-1 rounded-lg print:text-emerald-700 print:border-emerald-300">個人精算証明書</span>
              <span className="text-xs font-black text-slate-500">{reportVersion}</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight print:text-black">{event.title}</h1>
            <p className="text-sm text-slate-400 mt-0.5 print:text-slate-600">{event.startStr}{event.venue ? ` — ${event.venue}` : ""}</p>
            <p className="text-xs text-slate-600 mt-1 print:text-slate-400">{approvedAtStr ? `精算確定: ${approvedAtStr}` : "精算確定済み"}</p>
          </div>
          <div className="text-right">
            <button onClick={() => window.print()} className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-white border border-slate-800 hover:border-slate-600 px-3 py-2 rounded-xl transition-all print:hidden">
              <Printer size={14} /> 印刷
            </button>
            <p className="text-xs text-slate-600 mt-2 print:text-slate-500">受取人: {artistName}</p>
          </div>
        </div>

        {/* CB警告 */}
        {hasCb && (
          <div className="bg-red-950/60 border border-red-500/40 rounded-2xl p-5 mb-6 print:bg-red-50 print:border-red-300">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-red-400 print:text-red-600" />
              <h2 className="text-sm font-black text-red-300 print:text-red-700">チャージバック発生 — 自身への直接ホールド</h2>
              <span className="text-xs font-black text-red-500 bg-red-950/80 border border-red-500/30 px-2 py-0.5 rounded-full print:text-red-600">{myClaims.length}件</span>
            </div>
            <p className="text-xs text-red-600 mb-3 print:text-red-500">あなたのConnect口座が宛先の決済でCBが発生しています。</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "凍結額（決済単位）", value: frozenDistTotal, desc: "CB係争中の決済の配分分" },
                { label: "CB手数料（実費）",  value: myCbFeeTotal,    desc: "Stripe係争手数料" },
                { label: "決済手数料不足分",  value: myProcFeeTotal,  desc: "取消による追加損失" },
              ].map(item => (
                <div key={item.label} className="bg-red-950/40 rounded-xl p-3 print:bg-red-100">
                  <p className="text-xs text-red-500 font-black print:text-red-600">{item.label}</p>
                  <p className="text-lg font-black text-red-300 mt-1 print:text-red-700">{yen(item.value)}</p>
                  <p className="text-xs text-red-600 mt-0.5 print:text-red-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 個人サマリー 4枚 */}
        <div className="grid grid-cols-2 gap-4 mb-8 print:mb-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 print:bg-slate-50 print:border-slate-300">
            <div className="flex items-center gap-1.5 mb-2"><Shield size={13} className="text-slate-600" /><p className="text-xs font-black text-slate-600 print:text-slate-500">分配予定総額</p></div>
            <p className="text-3xl font-black text-white print:text-black">{yen(totalDistAmount)}</p>
            <p className="text-xs text-slate-600 mt-1 print:text-slate-500">事前設定ルールによる自動算出</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 print:bg-slate-50 print:border-slate-300">
            <div className="flex items-center gap-1.5 mb-2"><Lock size={13} className="text-slate-600" /><p className="text-xs font-black text-slate-600 print:text-slate-500">CB拘束額（合計）</p></div>
            <p className={`text-3xl font-black ${hasCb ? "text-red-400" : "text-slate-500"} print:text-black`}>{yen(cbHoldTotal)}</p>
            {hasCb && (
              <p className="text-xs text-slate-600 mt-1 print:text-slate-500">
                凍結 {yen(frozenDistTotal)} + 手数料 {yen(myCbFeeTotal + myProcFeeTotal)}
              </p>
            )}
            {!hasCb && <p className="text-xs text-slate-600 mt-1 print:text-slate-500">CB拘束なし</p>}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 print:bg-slate-50 print:border-slate-300">
            <div className="flex items-center gap-1.5 mb-2"><CheckCircle2 size={13} className="text-slate-600" /><p className="text-xs font-black text-slate-600 print:text-slate-500">差引 確定受取額</p></div>
            <p className={`text-3xl font-black ${hasCb ? "text-amber-300" : "text-emerald-400"} print:text-black`}>
              {yen(totalDistAmount - cbHoldTotal)}
            </p>
            <p className="text-xs text-slate-600 mt-1 print:text-slate-500">
              {hasCb ? "CB解決後に最終確定" : "14日待機後に出金可能"}
            </p>
            {totalTaxAmount > 0 && <p className="text-xs text-slate-600 mt-0.5 print:text-slate-500">うち消費税 {yen(totalTaxAmount)}</p>}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 print:bg-slate-50 print:border-slate-300">
            <div className="flex items-center gap-1.5 mb-2"><Clock size={13} className="text-slate-600" /><p className="text-xs font-black text-slate-600 print:text-slate-500">振込実績</p></div>
            <p className={`text-3xl font-black ${settledAmount > 0 ? "text-emerald-400" : "text-slate-500"} print:text-black`}>
              {settledAmount > 0 ? yen(settledAmount) : "未振込"}
            </p>
            <p className="text-xs text-slate-600 mt-1 print:text-slate-500">{settledAmount > 0 ? "Stripe Transfer 完了" : "出金可能になり次第振込"}</p>
          </div>
        </div>

        {/* QR別配分 */}
        <div className="mb-8 print:mb-6">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 print:text-slate-600">QR設定別 配分明細</h2>
          <div className="space-y-3">
            {qrGroups.map(qr => {
              const hasMyFreeze = qr.myFrozenAmount > 0;
              return (
                <div key={qr.qr_config_id} className={`bg-slate-900 border rounded-2xl overflow-hidden print:bg-white ${hasMyFreeze ? "border-red-500/30 print:border-red-200" : "border-slate-800 print:border-slate-300"}`}>
                  <div className="flex items-center justify-between px-5 py-3 bg-slate-800/60 border-b border-slate-700/50 print:bg-slate-100 print:border-slate-200">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black text-white print:text-black">{qr.label}</p>
                      <span className="text-xs text-pink-400 font-bold print:text-pink-600">{qr.txCount.toLocaleString()}チア</span>
                    </div>
                    <p className="text-xs text-slate-500 print:text-slate-600">配分原資 {yen(qr.qrNet)}</p>
                  </div>
                  <div className="px-5 py-4">
                    {/* 比率バー */}
                    <div className="flex h-4 rounded-full overflow-hidden mb-3">
                      <div className={`transition-all ${hasMyFreeze ? "bg-red-600/70" : "bg-pink-500"}`} style={{ width: `${(qr.myRatio * 100).toFixed(1)}%` }} />
                      <div className="bg-slate-700 flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-400 mb-1 print:text-slate-600">あなたの取得率</p>
                        <p className={`text-2xl font-black ${hasMyFreeze ? "text-orange-300" : "text-white"} print:text-black`}>{pctStr(qr.myRatio)}</p>
                        <p className={`text-sm font-bold mt-0.5 ${hasMyFreeze ? "text-orange-300" : "text-emerald-400"} print:text-black`}>{yen(qr.myAmount)}</p>
                        {hasMyFreeze && (
                          <p className="text-xs text-red-400 mt-0.5 flex items-center gap-1 print:text-red-600">
                            <Lock size={10} /> うちCB凍結 {yen(qr.myFrozenAmount)}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 mb-1 print:text-slate-500">その他（複数名）</p>
                        <p className="text-2xl font-black text-slate-500 print:text-slate-600">{pctStr(qr.othersRatio)}</p>
                        <p className="text-sm text-slate-600 mt-0.5 print:text-slate-500">{yen(qr.qrNet - qr.myAmount)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CB明細 */}
        {myClaims.length > 0 && (
          <div className="mb-8 print:mb-6">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 print:text-slate-600">あなたへの直接チャージバック明細</h2>
            <div className="space-y-3">
              {myClaims.map((cb, i) => {
                const st = CB_STATUS_LABEL[cb.status] ?? { label: cb.status, color: "text-slate-400" };
                return (
                  <div key={cb.claim_id} className="bg-slate-900 border border-red-500/20 rounded-2xl p-4 print:bg-white print:border-red-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-500">#{i + 1}</span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full border border-current/30 ${st.color}`}>{st.label}</span>
                        <span className="text-xs text-slate-500 print:text-slate-600">{new Date(cb.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>
                      </div>
                      <span className="text-red-400 font-black print:text-red-700">{yen(cb.claim_amount)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div><p className="text-slate-600 print:text-slate-500">対象取引</p><p className="text-slate-400 font-mono text-xs print:text-slate-600">{cb.original_transaction_id.slice(0, 16)}…</p></div>
                      <div><p className="text-slate-600 print:text-slate-500">Stripe係争手数料</p><p className="text-red-400 font-bold print:text-red-600">{yen(cb.stripe_dispute_fee ?? 1500)}</p><p className="text-xs text-slate-600">あなたの取り分から控除</p></div>
                      <div><p className="text-slate-600 print:text-slate-500">決済手数料不足分</p><p className="text-amber-400 font-bold print:text-amber-600">{yen(cb.stripe_processing_fee ?? 0)}</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* フッター */}
        <div className="border-t border-slate-800 pt-6 print:border-slate-200">
          <div className="flex items-start justify-between gap-6">
            <p className="text-xs text-slate-700 leading-relaxed print:text-slate-400">
              本書は Direct Cheers が自動生成した個人精算証明書です。記載の金額は事前に審査・登録された配分ルールに基づきシステムが自動算出したものであり、税務処理・確定申告等の財務エビデンスとしてご使用いただけます。他の出演者の情報・イベント総売上等は本書には含まれていません。各決済のチャージバック（異議申し立て）待機期間中に新たなチャージバックが発生した場合、記載内容が変更される可能性があります。
            </p>
            <p className="text-xs text-slate-700 shrink-0 print:text-slate-400">Direct Cheers {reportVersion}</p>
          </div>
        </div>
      </div>
      <style>{`@media print { @page { size: A4; margin: 20mm 15mm; } body { font-size: 11px; } }`}</style>
    </div>
  );
}
