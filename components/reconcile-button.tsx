"use client";

import { useState } from "react";
import { RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function ReconcileButton({ eventId, pendingCount }: { eventId: string; pendingCount: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    reconciled: number;
    errors: number;
    errorDetails: Array<{ transaction_id: string; stripe_pi_id: string | null; error: string }>;
  } | null>(null);
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
      setResult({
        reconciled: data.reconciled,
        errors: data.errors,
        errorDetails: data.errorDetails ?? [],
      });
      router.refresh();
    }
  };

  if (result) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-400">
          <CheckCircle2 size={12} />
          照合{result.reconciled}件完了{result.errors > 0 ? ` / エラー${result.errors}件` : ""}
        </div>
        {result.errorDetails.length > 0 && (
          <div className="space-y-1 border border-red-500/20 bg-red-500/5 rounded-xl p-3">
            <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1.5">照合エラー詳細</p>
            {result.errorDetails.map((e) => (
              <div key={e.transaction_id} className="space-y-0.5">
                <p className="text-[10px] font-mono text-slate-400">
                  PI: {e.stripe_pi_id ?? "(null)"}
                </p>
                <p className="text-[10px] text-red-300 break-all">{e.error}</p>
              </div>
            ))}
          </div>
        )}
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
