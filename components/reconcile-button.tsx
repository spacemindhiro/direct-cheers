"use client";

import { useState } from "react";
import { RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function ReconcileButton({ eventId, pendingCount }: { eventId: string; pendingCount: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ reconciled: number; errors: number } | null>(null);
  const [error, setError] = useState("");

  const handleRun = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    const res = await fetch("/api/admin/reconcile/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "照合失敗");
    } else {
      setResult({ reconciled: data.reconciled, errors: data.errors });
      router.refresh();
    }
  };

  if (result) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-400">
        <CheckCircle2 size={12} />
        照合{result.reconciled}件完了{result.errors > 0 ? ` / エラー${result.errors}件` : ""}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleRun}
        disabled={loading}
        className="flex items-center gap-1.5 text-[10px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 rounded-full px-3 py-1 transition-all disabled:opacity-50"
      >
        {loading
          ? <><Loader2 size={11} className="animate-spin" />照合中...</>
          : <><RefreshCw size={11} />照合実行（{pendingCount}件未照合）</>
        }
      </button>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
