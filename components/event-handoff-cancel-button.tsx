"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle, Loader2 } from "lucide-react";

export function EventHandoffCancelButton({
  eventId,
  handoffId,
  toAgentName,
}: {
  eventId: string;
  handoffId: string;
  toAgentName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleCancel = () => {
    if (!confirm(`${toAgentName}さんへの、このイベントの担当依頼を取り消しますか？`)) return;

    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/events/${eventId}/handoff`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoff_id: handoffId }),
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
    <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] p-5 space-y-3">
      <div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">このイベントの担当を依頼中</p>
        <p className="text-sm font-black text-white mt-1">{toAgentName}さんに、このイベントだけ担当をお願いする依頼を送信済みです</p>
        <p className="text-xs text-slate-500 mt-1">相手の回答があるまでお待ちください。</p>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={handleCancel}
        disabled={isPending}
        className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-black text-xs transition-all disabled:opacity-60"
      >
        {isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
        依頼を取り消す
      </button>
    </div>
  );
}
