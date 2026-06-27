"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle, Loader2 } from "lucide-react";

export function EventCancelButton({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();

  const handleRequest = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/events/${eventId}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      router.refresh();
    });
  };

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/40 text-slate-400 hover:text-red-400 rounded-xl font-black text-xs transition-all"
      >
        <XCircle size={13} /> 中止申請
      </button>
    );
  }

  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 space-y-3">
      <p className="text-sm font-black text-red-400">イベントの中止を申請しますか？</p>
      <p className="text-xs text-slate-500">エージェントの承認後に中止が確定します。</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={handleRequest}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded-xl font-black text-xs transition-all disabled:opacity-60"
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
          申請する
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="px-4 py-2 text-xs text-slate-600 hover:text-slate-400 font-bold transition-colors"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
