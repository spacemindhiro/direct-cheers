"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function SettleButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleApprove = async () => {
    if (!confirm("このイベントの精算を承認しますか？Stripe送金が実行されます。")) return;
    setLoading(true);
    setError("");

    const res = await fetch(`/api/events/${eventId}/settle`, { method: "POST" });
    const data = await res.json();
    setLoading(false);

    if (data.error) {
      setError(data.error);
    } else {
      setDone(true);
      router.refresh();
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 text-green-400 text-sm font-black">
        <CheckCircle2 size={16} /> 精算完了
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleApprove}
        disabled={loading}
        className="h-10 px-5 bg-emerald-500 hover:brightness-110 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-2"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
        精算承認
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
