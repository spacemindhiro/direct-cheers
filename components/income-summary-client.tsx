"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, ChevronLeft, ChevronRight, Download, Wallet, Landmark, Mic2 } from "lucide-react";

type LayerFigures = { gross: number; reversed: number; net: number; outstanding_balance?: number };
type Summary = {
  platform: LayerFigures;
  agent: LayerFigures;
  organizer_artist: LayerFigures;
  total_net: number;
};
type ApiResponse = {
  role: string;
  label: string;
  targetYear: number;
  targetMonth: number;
  summary: Summary;
};

function fmt(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function LayerCard({
  icon,
  title,
  color,
  figures,
  showBalance,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  figures: LayerFigures;
  showBalance: boolean;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{title}</p>
      </div>
      <p className="text-2xl font-black text-white italic tracking-tighter">{fmt(figures.net)}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
        <span>着金 {fmt(figures.gross)}</span>
        {figures.reversed > 0 && <span className="text-red-400">取消 -{fmt(figures.reversed)}</span>}
      </div>
      {showBalance && figures.outstanding_balance !== undefined && (
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[9px] text-slate-600 uppercase tracking-widest">未出金Stripe残高</span>
          <span className="text-xs font-bold text-amber-400">{fmt(figures.outstanding_balance)}</span>
        </div>
      )}
    </div>
  );
}

export function IncomeSummaryClient() {
  const now = new Date();
  const [year, setYear] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth()); // 前月をデフォルトに
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [csvLoading, setCsvLoading] = useState(false);

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/income-summary?year=${y}&month=${m}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "取得失敗");
      return;
    }
    setData(json);
  }, []);

  useEffect(() => {
    load(year, month);
  }, [year, month, load]);

  const goPrev = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); } else { setMonth((m) => m - 1); }
  };
  const goNext = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); } else { setMonth((m) => m + 1); }
  };

  const handleDownloadCsv = async () => {
    setCsvLoading(true);
    const res = await fetch(`/api/income-summary/csv?year=${year}&month=${month}`);
    setCsvLoading(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "CSVダウンロード失敗");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `income_${year}${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const role = data?.role;
  const showPlatform = role === "admin";
  const showAgent = role === "admin" || role === "agent";
  const showOrganizerArtist = true; // 全ロール共通で表示（該当なしなら0円表示）

  return (
    <div className="space-y-6">
      {/* 月切り替え */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3">
        <button onClick={goPrev} className="p-1.5 text-slate-500 hover:text-white transition-colors">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-black text-white italic">{data?.label ?? `${year}年${month}月度`}</p>
        <button onClick={goNext} className="p-1.5 text-slate-500 hover:text-white transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-slate-600" size={24} />
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-sm text-red-400 font-bold">{error}</div>
      )}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {showPlatform && (
              <LayerCard
                icon={<Landmark size={16} className="text-cyan-400" />}
                title="プラットフォーム純利"
                color="bg-cyan-500/10"
                figures={data.summary.platform}
                showBalance={false}
              />
            )}
            {showAgent && (
              <LayerCard
                icon={<Wallet size={16} className="text-indigo-400" />}
                title="エージェント報酬"
                color="bg-indigo-500/10"
                figures={data.summary.agent}
                showBalance
              />
            )}
            {showOrganizerArtist && (
              <LayerCard
                icon={<Mic2 size={16} className="text-pink-400" />}
                title="ダイレクト着金"
                color="bg-pink-500/10"
                figures={data.summary.organizer_artist}
                showBalance
              />
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">当月合計（着金純額）</p>
              <p className="text-2xl font-black text-emerald-400 italic tracking-tighter">{fmt(data.summary.total_net)}</p>
            </div>
            <button
              onClick={handleDownloadCsv}
              disabled={csvLoading}
              className="flex items-center gap-1.5 text-xs font-black text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl px-4 py-2.5 transition-colors disabled:opacity-40"
            >
              {csvLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              CSVダウンロード
            </button>
          </div>

          <p className="text-[10px] text-slate-600 leading-relaxed">
            着金日基準（現金主義）で集計しています。Stripe Connect口座へ実際にTransferされた日を収入計上日としており、
            決済確定日や出金申請日とは異なる場合があります。未出金Stripe残高は確定申告の収入額には含まれません。
          </p>
        </>
      )}
    </div>
  );
}
