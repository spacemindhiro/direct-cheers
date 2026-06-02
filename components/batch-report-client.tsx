"use client";

import { useState, useTransition } from "react";
import { CheckCircle, AlertCircle, Clock, RefreshCw } from "lucide-react";

type Report = {
  id: string;
  process_date: string;
  task_name: string;
  total_events: number | null;
  target_count: number;
  target_amount: number;
  success_count: number;
  success_amount: number;
  failed_count: number;
  failed_amount: number;
  status: string;
  created_at: string;
};

type Detail = {
  id: string;
  report_id: string;
  task_name: string;
  event_name: string | null;
  organizer_name: string | null;
  customer_name: string | null;
  target_name: string | null;
  amount: number;
  failure_reason: string;
  action_status: string;
  created_at: string;
};

function fmt(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function StatusBadge({ status }: { status: string }) {
  const isAlert = status === "要確認・未回収あり";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${
      isAlert
        ? "bg-red-500/20 text-red-300 border border-red-500/30"
        : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
    }`}>
      {isAlert ? <AlertCircle size={10} /> : <CheckCircle size={10} />}
      {status}
    </span>
  );
}

export function BatchReportClient({ reports, initialDetails }: {
  reports: Report[];
  initialDetails: Detail[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    reports.find(r => r.status === "要確認・未回収あり")?.id ?? reports[0]?.id ?? null
  );
  const [details, setDetails] = useState<Detail[]>(initialDetails);
  const [updating, setUpdating] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedReport = reports.find(r => r.id === selectedId);
  const selectedDetails = details.filter(d => d.report_id === selectedId);

  async function toggleActionStatus(detail: Detail) {
    const next = detail.action_status === "未対応" ? "対応済" : "未対応";
    setUpdating(detail.id);
    try {
      const res = await fetch(`/api/admin/batch-reports/details/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_status: next }),
      });
      if (res.ok) {
        setDetails(prev => prev.map(d => d.id === detail.id ? { ...d, action_status: next } : d));
      }
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* ── サマリー一覧 ── */}
      <div>
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4">
          処理結果サマリー
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {["処理日", "バッチ名", "対象件数", "対象金額", "成功", "未回収", "ステータス", ""].map(h => (
                  <th key={h} className="text-left text-[10px] font-black text-slate-600 uppercase tracking-widest pb-3 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map(r => {
                const isAlert = r.status === "要確認・未回収あり";
                const isSelected = r.id === selectedId;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`border-b cursor-pointer transition-colors ${
                      isAlert
                        ? "border-red-900/40 bg-red-950/20 hover:bg-red-950/30"
                        : "border-slate-800/50 hover:bg-slate-900/50"
                    } ${isSelected ? "ring-1 ring-inset ring-pink-500/30" : ""}`}
                  >
                    <td className="py-3 pr-4 text-slate-400 text-xs whitespace-nowrap">{r.process_date}</td>
                    <td className="py-3 pr-4 text-white font-bold text-xs">{r.task_name}</td>
                    <td className="py-3 pr-4 text-slate-300 text-xs text-right">{r.target_count.toLocaleString()}件</td>
                    <td className="py-3 pr-4 text-slate-300 text-xs text-right">{fmt(r.target_amount)}</td>
                    <td className="py-3 pr-4 text-emerald-400 text-xs text-right font-bold">{r.success_count}件</td>
                    <td className={`py-3 pr-4 text-xs text-right font-black ${r.failed_count > 0 ? "text-red-400" : "text-slate-600"}`}>
                      {r.failed_count > 0 ? `${r.failed_count}件 ${fmt(r.failed_amount)}` : "−"}
                    </td>
                    <td className="py-3 pr-4"><StatusBadge status={r.status} /></td>
                    <td className="py-3 text-xs text-pink-500 font-bold cursor-pointer whitespace-nowrap">
                      詳細 →
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {reports.length === 0 && (
            <div className="text-center py-12 text-slate-600 text-sm">レポートがありません</div>
          )}
        </div>
      </div>

      {/* ── リスク明細 ── */}
      {selectedReport && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
              リスク明細
            </h2>
            <span className="text-xs text-slate-500">
              {selectedReport.task_name} — {selectedReport.process_date}
            </span>
            {selectedReport.failed_count === 0 && (
              <span className="text-xs text-emerald-500 flex items-center gap-1">
                <CheckCircle size={12} /> 未回収なし
              </span>
            )}
          </div>

          {selectedDetails.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-600 text-sm">
              このバッチの未回収明細はありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    {["イベント", "オーガナイザー", "対象者", "金額", "失敗理由", "対応状況", "操作"].map(h => (
                      <th key={h} className="text-left text-[10px] font-black text-slate-600 uppercase tracking-widest pb-3 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedDetails.map(d => (
                    <tr key={d.id} className="border-b border-slate-800/50">
                      <td className="py-3 pr-4 text-slate-300 text-xs">{d.event_name ?? "−"}</td>
                      <td className="py-3 pr-4 text-slate-400 text-xs">{d.organizer_name ?? "−"}</td>
                      <td className="py-3 pr-4 text-slate-300 text-xs">{d.customer_name ?? d.target_name ?? "−"}</td>
                      <td className="py-3 pr-4 text-red-400 font-bold text-xs text-right whitespace-nowrap">
                        {fmt(d.amount)}
                      </td>
                      <td className="py-3 pr-4 text-slate-400 text-xs max-w-xs">{d.failure_reason}</td>
                      <td className="py-3 pr-4">
                        <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${
                          d.action_status === "対応済"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        }`}>
                          {d.action_status === "対応済" ? <span className="flex items-center gap-1"><CheckCircle size={9} /> 対応済</span> : <span className="flex items-center gap-1"><Clock size={9} /> 未対応</span>}
                        </span>
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => toggleActionStatus(d)}
                          disabled={updating === d.id}
                          className="flex items-center gap-1 text-[10px] font-black text-pink-400 hover:text-pink-300 transition-colors disabled:opacity-40"
                        >
                          {updating === d.id ? <RefreshCw size={10} className="animate-spin" /> : null}
                          {d.action_status === "未対応" ? "対応済にする" : "未対応に戻す"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
