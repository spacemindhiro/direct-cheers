"use client";

import { useState } from "react";
import { FlaskConical, Loader2, ArrowDownToLine } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = {
  eventId: string;
  eventTitle: string;
  pendingAmount: number;
  transferFee: number;
};

export function PayoutBypassButton({ eventId, eventTitle, pendingAmount, transferFee }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const net = pendingAmount - transferFee;

  const handlePayout = async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_amount: pendingAmount, bypass_event_id: eventId }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.error) {
      setError(data.error);
    } else {
      setSuccess(true);
      router.refresh();
    }
  };

  if (success) {
    return (
      <p className="text-xs text-emerald-400 font-bold text-center py-1">✓ 出金申請しました</p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border bg-slate-800 border-slate-700 text-slate-500 hover:text-amber-400 hover:border-amber-500/30 transition-all"
      >
        <FlaskConical size={10} /> 14日待機スキップ（テスト）
      </button>
    );
  }

  return (
    <div className="space-y-2 border border-amber-500/30 bg-amber-500/5 rounded-xl p-3">
      <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
        <FlaskConical size={10} /> テスト：14日待機スキップ
      </p>
      <p className="text-[10px] text-slate-500">
        「{eventTitle}」の保留中 ¥{pendingAmount.toLocaleString()} を即時出金します
      </p>
      {net > 0 && (
        <p className="text-[10px] text-slate-400">手数料 ¥{transferFee.toLocaleString()} 控除後 → <span className="text-emerald-400 font-black">¥{net.toLocaleString()}</span></p>
      )}
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handlePayout}
          disabled={loading || net <= 0}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/30 transition-all disabled:opacity-40"
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : <ArrowDownToLine size={10} />}
          出金する
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
