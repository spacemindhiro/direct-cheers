"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, RotateCcw } from "lucide-react";

type Props = { eventId: string; eventTitle: string };

export function AdminAuthExpiryActions({ eventId, eventTitle }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<"capture" | "refund" | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handle = async (action: "capture" | "refund") => {
    if (!confirm(
      action === "capture"
        ? `「${eventTitle}」の全決済をキャプチャします。精算は引き続き通常フローで行います。よろしいですか？`
        : `「${eventTitle}」の全決済を返金します。この操作は取り消せません。よろしいですか？`
    )) return;

    setLoading(action);
    setError("");
    const res = await fetch(`/api/admin/events/${eventId}/${action === "capture" ? "capture-all" : "refund-all"}`, {
      method: "POST",
    });
    const data = await res.json();
    setLoading(null);
    if (data.error) {
      setError(data.error);
    } else {
      setResult(
        action === "capture"
          ? `キャプチャ完了（${data.captured}件）`
          : `返金完了（${data.refunded}件）`
      );
      router.refresh();
    }
  };

  if (result) {
    return <p className="text-[10px] text-emerald-400 font-black">{result}</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handle("capture")}
          disabled={!!loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border bg-slate-800 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 transition-all disabled:opacity-40"
        >
          {loading === "capture" ? <Loader2 size={10} className="animate-spin" /> : <ShieldCheck size={10} />}
          キャプチャ確定
        </button>
        <button
          type="button"
          onClick={() => handle("refund")}
          disabled={!!loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border bg-slate-800 border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-40"
        >
          {loading === "refund" ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
          全件返金
        </button>
      </div>
    </div>
  );
}
