"use client";

import { useState } from "react";
import { Zap, Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function CaptureAllButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ captured: number; errors: number; errorDetails: { pi_id: string; error: string }[] } | null>(null);
  const [error, setError] = useState("");

  const handleRun = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    const res = await fetch(`/api/admin/events/${eventId}/capture-all`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "キャプチャ失敗");
    } else {
      setResult({ captured: data.captured, errors: data.errors, errorDetails: data.errorDetails ?? [] });
      router.refresh();
    }
  };

  if (result) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-400">
          <CheckCircle2 size={12} />
          キャプチャ完了 {result.captured}件{result.errors > 0 ? ` / 失敗${result.errors}件` : ""}
        </div>
        {result.errorDetails.length > 0 && (
          <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-3 space-y-1">
            <p className="text-[9px] font-black text-red-400 uppercase tracking-widest">キャプチャエラー</p>
            {result.errorDetails.map((e) => (
              <div key={e.pi_id}>
                <p className="text-[10px] font-mono text-slate-400">{e.pi_id}</p>
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
        className="flex items-center gap-1.5 text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 rounded-full px-3 py-1 transition-all disabled:opacity-50"
      >
        {loading
          ? <><Loader2 size={11} className="animate-spin" />キャプチャ中...</>
          : <><Zap size={11} />キャプチャ再実行</>
        }
      </button>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
