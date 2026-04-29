"use client";

import { useState } from "react";
import { Zap, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = { eventId: string; eventTitle: string };

type Result = { profile_id: string; amount: number; status: string; error?: string };

export function AdminForcePayoutButton({ eventId, eventTitle }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState("");

  const handleForce = async () => {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/admin/events/${eventId}/force-payout`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (data.error) {
      setError(data.error);
    } else {
      setResults(data.results);
      router.refresh();
    }
  };

  if (results) {
    return (
      <div className="space-y-1.5 border border-slate-700 rounded-xl p-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">強制出金 完了</p>
        {results.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            {r.status === "paid"
              ? <CheckCircle2 size={10} className="text-emerald-400 shrink-0" />
              : <XCircle size={10} className="text-slate-500 shrink-0" />}
            <span className="text-slate-400">{r.profile_id.slice(0, 8)}…</span>
            <span className={r.status === "paid" ? "text-emerald-400 font-black" : "text-slate-600"}>
              {r.status === "paid" ? `¥${r.amount.toLocaleString()} 出金` : r.error ?? r.status}
            </span>
          </div>
        ))}
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
        <Zap size={10} /> 強制出金
      </button>
    );
  }

  return (
    <div className="space-y-2 border border-amber-500/30 bg-amber-500/5 rounded-xl p-3">
      <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
        <Zap size={10} /> 強制出金（テスト用）
      </p>
      <p className="text-[10px] text-slate-500">
        「{eventTitle}」の全出演者・スタッフへ14日待機をスキップして即時出金します
      </p>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleForce}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/30 transition-all disabled:opacity-40"
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
          実行する
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
