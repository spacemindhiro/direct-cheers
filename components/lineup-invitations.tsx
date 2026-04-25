"use client";

import { useState } from "react";
import { Mic2, Check, X, Loader2, ChevronRight } from "lucide-react";
import Link from "next/link";

type LineupItem = {
  event_artist_id: string;
  event_id: string;
  status: "pending" | "confirmed";
  invite_message?: string | null;
  event: {
    title: string;
    venue: string;
    start_at: string;
    organizer_profile_id: string;
    organizer_name: string;
  } | null;
};

export function LineupInvitations({
  invites,
  artistId,
}: {
  invites: LineupItem[];
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
      if (action === "reject") {
        setItems((prev) => prev.filter((i) => i.event_id !== eventId));
      } else {
        setItems((prev) =>
          prev.map((i) => i.event_id === eventId ? { ...i, status: "confirmed" } : i)
        );
      }
    } finally {
      setLoading((prev) => ({ ...prev, [eventId]: false }));
    }
  };

  if (items.length === 0) return null;

  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <div className="space-y-4">
      <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
        <Mic2 size={14} className="text-pink-500" /> 出演
        {pendingCount > 0 && (
          <span className="text-pink-500">（依頼 {pendingCount}件）</span>
        )}
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

          if (inv.status === "confirmed") {
            return (
              <Link
                key={inv.event_artist_id}
                href={`/dashboard/events/${inv.event_id}`}
                className="bg-slate-900 border border-emerald-500/20 hover:border-emerald-500/40 rounded-[1.5rem] px-6 py-4 flex items-center justify-between gap-4 transition-colors"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-black text-white truncate">{inv.event?.title ?? "—"}</p>
                  <p className="text-xs text-slate-500">
                    {inv.event?.venue}
                    {startDate && <span> · {startDate}</span>}
                  </p>
                </div>
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest shrink-0">出演確定</span>
              </Link>
            );
          }

          return (
            <div
              key={inv.event_artist_id}
              className="bg-slate-900 border border-pink-500/20 rounded-[1.5rem] px-6 py-5 space-y-4"
            >
              <Link
                href={`/dashboard/events/${inv.event_id}`}
                className="flex items-start justify-between gap-3 group"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-black text-white truncate group-hover:text-pink-400 transition-colors">
                    {inv.event?.title ?? "—"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {inv.event?.venue}
                    {startDate && <span> · {startDate}</span>}
                  </p>
                  <p className="text-[10px] text-slate-600 font-bold">
                    依頼元: <span className="text-slate-400">{inv.event?.organizer_name ?? "—"}</span>
                  </p>
                  <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">
                    出演依頼 — 承認待ち
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-600 group-hover:text-pink-400 shrink-0 mt-0.5 transition-colors" />
              </Link>

              {inv.invite_message && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">メッセージ</p>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{inv.invite_message}</p>
                </div>
              )}

              <div className="flex items-center gap-3">
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin text-slate-500" />
                ) : (
                  <>
                    <button
                      onClick={() => respond(inv.event_id, "reject")}
                      className="flex-1 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center gap-1.5 text-xs font-black text-slate-400 hover:text-red-400 hover:border-red-500/40 transition-all"
                    >
                      <X size={13} /> 辞退
                    </button>
                    <button
                      onClick={() => respond(inv.event_id, "accept")}
                      className="flex-1 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center gap-1.5 text-xs font-black text-emerald-400 hover:bg-emerald-500/20 transition-all"
                    >
                      <Check size={13} /> 承認
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
