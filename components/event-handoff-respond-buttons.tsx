"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export function EventHandoffRespondButtons({
  eventId,
  handoffId,
  fromAgentName,
}: {
  eventId: string;
  handoffId: string;
  fromAgentName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handle = (action: "accept" | "reject") => {
    if (action === "accept") {
      if (!confirm("承認すると、このイベントの担当となり、各種サポートを引き受けることになります。よろしいですか？")) return;
    } else {
      if (!confirm("このイベントの担当依頼を却下しますか？")) return;
    }

    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/events/${eventId}/handoff`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoff_id: handoffId, action }),
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
    <div className="bg-violet-500/10 border border-violet-500/20 rounded-[1.5rem] p-5 space-y-3">
      <div>
        <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">このイベントだけ担当を任されています</p>
        <p className="text-sm font-black text-white mt-1">{fromAgentName}さんから、このイベントだけ担当を任されました</p>
        <p className="text-xs text-slate-500 mt-1">承諾すると、このイベントの担当となり各種サポートを引き受けることになります。引き継ぎ対象はこのイベントのみです。</p>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={() => handle("accept")}
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-500 hover:bg-violet-400 text-white rounded-xl font-black text-xs transition-all disabled:opacity-60"
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
          承諾する
        </button>
        <button
          onClick={() => handle("reject")}
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-black text-xs transition-all disabled:opacity-60"
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
          却下する
        </button>
      </div>
    </div>
  );
}
