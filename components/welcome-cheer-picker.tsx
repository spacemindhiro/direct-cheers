"use client";

import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";

type WelcomeCheerCandidate = {
  product_id: string;
  name: string;
  artist_name: string | null;
  artist_avatar: string | null;
};

type WelcomeCheerState = {
  has_welcome_cheer: boolean;
  amount?: number;
  locked?: boolean;
  current_recipient_name?: string | null;
  candidates?: WelcomeCheerCandidate[];
};

export function WelcomeCheerPicker({ ticketId }: { ticketId: string }) {
  const [state, setState] = useState<WelcomeCheerState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmedName, setConfirmedName] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/entrance/welcome-cheer/${ticketId}`)
      .then((r) => r.json())
      .then(setState)
      .catch(() => {});
  }, [ticketId]);

  if (!state?.has_welcome_cheer) return null;

  if (state.locked || confirmedName) {
    return (
      <div className="bg-pink-500/5 border border-pink-500/20 rounded-2xl p-5 space-y-1.5">
        <div className="flex items-center gap-2">
          <Heart size={14} className="text-pink-500 fill-current" />
          <p className="text-sm font-black text-white">ウェルカムチア確定済み</p>
        </div>
        <p className="text-xs text-slate-400">
          ¥{(state.amount ?? 0).toLocaleString()} を {confirmedName ?? state.current_recipient_name ?? "演者"} に贈りました
        </p>
      </div>
    );
  }

  const handleConfirm = async () => {
    if (!selected) return;
    setConfirming(true);
    setError("");
    const res = await fetch(`/api/entrance/welcome-cheer/${ticketId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: selected }),
    });
    const data = await res.json();
    setConfirming(false);
    if (!res.ok) {
      setError(data.error === "ALREADY_LOCKED" ? "既に確定済みです" : "確定に失敗しました");
      return;
    }
    const chosen = state.candidates?.find((c) => c.product_id === selected);
    setConfirmedName(chosen?.artist_name ?? chosen?.name ?? "演者");
  };

  return (
    <div className="bg-pink-500/5 border border-pink-500/20 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Heart size={14} className="text-pink-500 fill-current" />
        <div>
          <p className="text-sm font-black text-white">ウェルカムチアを贈る</p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            入場料の一部（¥{(state.amount ?? 0).toLocaleString()}）を、応援したい演者に贈れます
          </p>
        </div>
      </div>

      {!state.candidates || state.candidates.length === 0 ? (
        <p className="text-xs text-slate-500">現在選択可能な演者がいません。未指定の場合は主催者に贈られます。</p>
      ) : (
        <div className="space-y-2">
          {state.candidates.map((c) => (
            <button
              key={c.product_id}
              type="button"
              onClick={() => setSelected(c.product_id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                selected === c.product_id
                  ? "bg-pink-500/20 border-pink-500/50"
                  : "bg-slate-900 border-slate-800 hover:border-slate-700"
              }`}
            >
              {c.artist_avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.artist_avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-800 shrink-0" />
              )}
              <span className="text-sm font-bold text-white">{c.artist_name ?? c.name}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="button"
        disabled={!selected || confirming}
        onClick={handleConfirm}
        className="w-full h-11 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-sm disabled:opacity-40 flex items-center justify-center gap-2 hover:brightness-110 transition-all"
      >
        {confirming ? <Loader2 size={16} className="animate-spin" /> : "この演者に贈る"}
      </button>
    </div>
  );
}
