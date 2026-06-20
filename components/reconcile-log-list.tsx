"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

type MismatchDetail = {
  transaction_id: string;
  stripe_pi_id: string | null;
  event_name?: string;
  expected: number;
  actual: number;
  diff: number;
};

type ErrorDetail = {
  transaction_id: string;
  stripe_pi_id: string | null;
  event_name?: string;
  error: string;
};

type LogRow = {
  log_id: string;
  run_at: string;
  target_date: string;
  total_checked: number;
  total_matched: number;
  total_mismatched: number;
  total_errors: number;
  summary: { mismatches?: MismatchDetail[]; errors?: ErrorDetail[] } | null;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function ReconcileLogList({ logs }: { logs: LogRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800">
      {logs.map((log) => {
        const hasIssue = log.total_mismatched > 0 || log.total_errors > 0;
        const mismatches = log.summary?.mismatches ?? [];
        const errors = log.summary?.errors ?? [];
        const hasDetail = mismatches.length > 0 || errors.length > 0;
        const isExpanded = expandedId === log.log_id;

        return (
          <div key={log.log_id}>
            <div className="px-5 py-3 flex items-center gap-4">
              <div className="min-w-0 flex-1 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5">
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">実行日</p>
                  <p className="text-xs font-bold text-slate-200">{fmtTime(log.run_at)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">対象日</p>
                  <p className="text-xs font-bold text-slate-200">{log.target_date}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">件数</p>
                  <p className="text-xs font-bold text-slate-200">
                    {log.total_checked}件 / 一致{log.total_matched}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {log.total_mismatched > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-black text-red-400">
                      <XCircle size={11} /> 不一致{log.total_mismatched}
                    </span>
                  )}
                  {log.total_errors > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-black text-amber-400">
                      <AlertTriangle size={11} /> エラー{log.total_errors}
                    </span>
                  )}
                  {log.total_mismatched === 0 && log.total_errors === 0 && log.total_checked > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400">
                      <CheckCircle2 size={11} /> 正常
                    </span>
                  )}
                  {log.total_checked === 0 && (
                    <span className="text-[10px] text-slate-600">対象なし</span>
                  )}
                </div>
              </div>
              {hasIssue && (
                <button
                  onClick={() => setExpandedId(isExpanded ? null : log.log_id)}
                  className="flex items-center gap-1 text-[10px] font-black text-indigo-400 hover:text-indigo-300 transition-colors shrink-0"
                >
                  明細を見る {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
            </div>

            {isExpanded && hasIssue && (
              <div className="px-5 pb-4 space-y-2">
                {!hasDetail && (
                  <p className="text-[10px] text-slate-600">
                    このログには明細が保存されていません（旧バージョンで実行されたログ）
                  </p>
                )}
                {mismatches.length > 0 && (
                  <div className="border border-red-500/30 bg-red-500/10 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                      <XCircle size={11} /> 金額不一致 {mismatches.length}件
                    </p>
                    {mismatches.map((m) => (
                      <div key={m.transaction_id} className="bg-slate-900/60 rounded-lg p-2 space-y-0.5">
                        {m.event_name && <p className="text-[10px] text-slate-300 font-bold">{m.event_name}</p>}
                        <p className="text-[10px] font-mono text-slate-400 break-all">PI: {m.stripe_pi_id ?? "(null)"}</p>
                        <p className="text-[11px] text-red-300 font-bold">
                          DB ¥{m.expected.toLocaleString()} ≠ Stripe ¥{m.actual.toLocaleString()}　差額 ¥{m.diff.toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {errors.length > 0 && (
                  <div className="border border-amber-500/30 bg-amber-500/10 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                      <AlertTriangle size={11} /> エラー {errors.length}件
                    </p>
                    {errors.map((e) => (
                      <div key={e.transaction_id} className="bg-slate-900/60 rounded-lg p-2 space-y-0.5">
                        {e.event_name && <p className="text-[10px] text-slate-300 font-bold">{e.event_name}</p>}
                        <p className="text-[10px] font-mono text-slate-400 break-all">PI: {e.stripe_pi_id ?? "(null)"}</p>
                        <p className="text-[11px] text-amber-300 break-all font-bold">{e.error}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
