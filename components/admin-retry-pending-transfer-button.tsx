"use client";

import { useState } from "react";
import { RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function AdminRetryPendingTransferButton({ pendingTransferId }: { pendingTransferId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ attempted: number; succeeded: number } | null>(null);
  const [error, setError] = useState("");

  const handleRetry = async () => {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/admin/pending-transfers/${pendingTransferId}/retry`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "再試行に失敗しました");
    } else {
      setResult(data);
      router.refresh();
    }
  };

  if (result) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-400">
        <CheckCircle2 size={11} /> {result.succeeded}/{result.attempted}件成功
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleRetry}
        disabled={loading}
        className="flex items-center gap-1 text-[10px] font-black text-indigo-400 hover:text-indigo-300 disabled:opacity-40 transition-colors"
      >
        {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
        今すぐ再試行
      </button>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
