"use client";

import { useState } from "react";
import { Play, Loader2, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { useRouter } from "next/navigation";

type RunResult = {
  success?: boolean;
  skipped?: boolean;
  report_id?: string;
  label?: string;
  error?: string;
};

export function AccountingRunButton({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState("");

  const handleRun = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    const res = await fetch("/api/admin/accounting/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "実行失敗");
    } else {
      setResult(data);
      router.refresh();
    }
  };

  if (result?.success) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-400">
        <CheckCircle2 size={12} /> 生成完了
      </span>
    );
  }
  if (result?.skipped) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-black text-amber-400">
        <AlertTriangle size={12} /> 既に生成済み
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleRun}
        disabled={loading}
        className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
        手動実行
      </button>
      {error && (
        <p className="text-[10px] text-red-400 font-bold">{error}</p>
      )}
    </div>
  );
}

export function AccountingDownloadButton({ yearMonth, label }: { yearMonth: string; label: string }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/accounting/${yearMonth}`);
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "ダウンロード失敗");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yayoi_${yearMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-1.5 text-[10px] font-black text-indigo-400 hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
      CSV
    </button>
  );
}
