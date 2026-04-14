"use client";

import { useState } from "react";
import { Mic2, Check, X, Loader2 } from "lucide-react";

type LineupInvite = {
  event_artist_id: string;
  event_id: string;
  event: { title: string; venue: string; start_at: string } | null;
};

export function LineupInvitations({
  invites,
  artistId,
}: {
  invites: LineupInvite[];
  artistId: string;
}) {
  const [items, setItems] = useState(invites);
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const respond = async (eventId: string, action: "accept" | "reject") => {
    setLoading((prev) => ({ ...prev, [eventId]: true }));
    try {
      await fetch(`/api/events/${eventId}/lineup/${artistId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setItems((prev) => prev.filter((i) => i.event_id !== eventId));
    } finally {
      setLoading((prev) => ({ ...prev, [eventId]: false }));
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
        <Mic2 size={14} className="text-pink-500" /> 出演依頼 ({items.length})
      </h2>
      <div className="space-y-3">
        {items.map((inv) => {
          const isLoading = loading[inv.event_id];
          const startDate = inv.event?.start_at
            ? new Date(inv.event.start_at).toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : null;
          return (
            <div
              key={inv.event_artist_id}
              className="bg-slate-900 border border-pink-500/20 rounded-[1.5rem] px-6 py-5 flex items-center justify-between gap-4"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-black text-white truncate">
                  {inv.event?.title ?? "—"}
                </p>
                <p className="text-xs text-slate-500">
                  {inv.event?.venue}
                  {startDate && <span> · {startDate}</span>}
                </p>
                <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">
                  出演依頼 — 承認待ち
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin text-slate-500" />
                ) : (
                  <>
                    <button
                      onClick={() => respond(inv.event_id, "reject")}
                      className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-red-400 hover:border-red-500/40 transition-all"
                      title="辞退"
                    >
                      <X size={15} />
                    </button>
                    <button
                      onClick={() => respond(inv.event_id, "accept")}
                      className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-all"
                      title="承認"
                    >
                      <Check size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
