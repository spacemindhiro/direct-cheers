"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function EventEndButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handle = async () => {
    if (!confirm("イベントを終了しますか？開催証跡の提出が可能になります。")) return;
    setLoading(true);
    setError("");
    const res = await fetch(`/api/events/${eventId}/end`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (data.error) { setError(data.error); return; }
    router.refresh();
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handle}
        disabled={loading}
        className="flex items-center gap-3 w-full bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-[1.5rem] p-5 transition-all group disabled:opacity-50"
      >
        <div className="w-10 h-10 bg-slate-700 rounded-2xl flex items-center justify-center border border-slate-600 shrink-0">
          {loading ? <Loader2 size={18} className="text-slate-400 animate-spin" /> : <CheckCircle2 size={18} className="text-slate-400" />}
        </div>
        <div className="text-left">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Event</p>
          <p className="font-black text-slate-300 text-sm">イベントを終了する</p>
        </div>
      </button>
      {error && <p className="text-xs text-red-400 px-2">{error}</p>}
    </div>
  );
}
