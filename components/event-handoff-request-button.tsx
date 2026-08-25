"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2 } from "lucide-react";

export function EventHandoffRequestButton({
  eventId,
  candidates,
}: {
  eventId: string;
  candidates: { profile_id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(candidates[0]?.profile_id ?? "");
  const router = useRouter();

  if (candidates.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] p-5 space-y-1">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">このイベントだけ他のエージェントに任せる</p>
        <p className="text-xs text-slate-500">他にアクティブなエージェントがいないため、今は任せられません。</p>
      </div>
    );
  }

  const handleRequest = () => {
    const candidate = candidates.find((c) => c.profile_id === selected);
    if (!candidate) return;
    if (!confirm(`このイベントだけ${candidate.name}さんに担当を任せますか？（引き継ぎ対象はこのイベントのみです）`)) return;

    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/events/${eventId}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_agent_id: selected }),
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
        <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">このイベントだけ他のエージェントに任せる</p>
        <p className="text-sm font-black text-white mt-1">担当を引き継いでもらいたい相手を選んでください</p>
        <p className="text-xs text-slate-500 mt-1">引き継ぎ対象はこのイベントのみです。</p>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-bold text-white"
        >
          {candidates.map((c) => (
            <option key={c.profile_id} value={c.profile_id}>{c.name}</option>
          ))}
        </select>
        <button
          onClick={handleRequest}
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-500 hover:bg-violet-400 text-white rounded-xl font-black text-xs transition-all disabled:opacity-60 shrink-0"
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
          このイベントの担当を依頼する
        </button>
      </div>
    </div>
  );
}
