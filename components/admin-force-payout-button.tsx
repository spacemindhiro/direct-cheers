"use client";

import { useState } from "react";
import { Zap, Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = { eventId: string; eventTitle: string; alreadyReleased?: boolean };

export function AdminForcePayoutButton({ eventId, eventTitle, alreadyReleased = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [released, setReleased] = useState<boolean>(alreadyReleased);
  const [error, setError] = useState("");

  const handleRelease = async () => {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/admin/events/${eventId}/force-payout`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (data.error) {
      setError(data.error);
    } else {
      setReleased(true);
      router.refresh();
    }
  };

  if (released) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-black">
        <CheckCircle2 size={10} /> ホールド解除済み
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border bg-slate-800 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-all"
      >
        <Zap size={10} /> ホールド解除
      </button>
    );
  }

  return (
    <div className="space-y-2 border border-amber-500/30 bg-amber-500/5 rounded-xl p-3">
      <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
        <Zap size={10} /> ホールド解除
      </p>
      <p className="text-[10px] text-slate-500">
        「{eventTitle}」の全分配について14日待機を解除します。各自が出金ページから即時出金できるようになります。
      </p>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleRelease}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/30 transition-all disabled:opacity-40"
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
          解除する
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-2 text-[10px] text-slate-600 hover:text-slate-400 transition-colors font-bold"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
