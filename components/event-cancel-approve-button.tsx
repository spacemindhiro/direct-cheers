"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export function EventCancelApproveButton({ eventId }: { eventId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handle = (approve: boolean) => {
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/events/${eventId}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-[1.5rem] p-5 space-y-3">
      <div>
        <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">中止申請</p>
        <p className="text-sm font-black text-white mt-1">オーガナイザーから中止申請が届いています</p>
        <p className="text-xs text-slate-500 mt-1">承認するとイベントが中止確定になります。</p>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={() => handle(true)}
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-xl font-black text-xs transition-all disabled:opacity-60"
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
          中止を承認
        </button>
        <button
          onClick={() => handle(false)}
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-black text-xs transition-all disabled:opacity-60"
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
          却下（公開に戻す）
        </button>
      </div>
    </div>
  );
}
