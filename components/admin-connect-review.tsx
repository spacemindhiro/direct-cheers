"use client";

import { DISPLAY_TZ } from "@/lib/display-tz";
import { useState } from "react";
import { CheckCircle, XCircle, Loader2, ChevronRight } from "lucide-react";
import Link from "next/link";

type PendingUser = {
  profile_id: string;
  display_name: string | null;
  role: string;
  stripe_connect_id: string | null;
  created_at: string;
};

const ROLE_LABELS: Record<string, string> = {
  agent: "エージェント",
  organizer: "オーガナイザー",
  artist: "アーティスト / DJ",
};

export function AdminConnectReview({ users }: { users: PendingUser[] }) {
  const [states, setStates] = useState<Record<string, "idle" | "loading" | "done">>({});
  const [results, setResults] = useState<Record<string, "approved" | "rejected">>({});

  const handle = async (profileId: string, action: "approve" | "reject") => {
    setStates((s) => ({ ...s, [profileId]: "loading" }));
    const res = await fetch(`/api/admin/connect-review/${profileId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      setResults((r) => ({ ...r, [profileId]: action === "approve" ? "approved" : "rejected" }));
      setStates((s) => ({ ...s, [profileId]: "done" }));
    } else {
      setStates((s) => ({ ...s, [profileId]: "idle" }));
      alert("エラーが発生しました");
    }
  };

  if (users.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
        <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">
          No pending reviews.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {users.map((u) => {
        const state = states[u.profile_id] ?? "idle";
        const result = results[u.profile_id];
        return (
          <div
            key={u.profile_id}
            className={`bg-slate-900 border rounded-[1.5rem] px-6 py-5 flex items-center justify-between gap-4 ${
              result === "approved"
                ? "border-emerald-500/30"
                : result === "rejected"
                ? "border-red-500/30"
                : "border-slate-800"
            }`}
          >
            <Link
              href={`/admin/connect-review/${u.profile_id}`}
              className="min-w-0 space-y-1.5 flex-1 group"
            >
              <p className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors flex items-center gap-1.5">
                {u.display_name ?? "—"} <ChevronRight size={13} className="text-slate-600 group-hover:text-indigo-400" />
              </p>
              <p className="text-xs text-slate-500">
                {ROLE_LABELS[u.role] ?? u.role} · {new Date(u.created_at).toLocaleDateString("ja-JP", { timeZone: DISPLAY_TZ })}
              </p>
              {u.stripe_connect_id && (
                <p className="text-[10px] text-indigo-400 font-mono">{u.stripe_connect_id}</p>
              )}
            </Link>

            <div className="flex items-center gap-2 shrink-0">
              {result === "approved" && (
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">承認済み</span>
              )}
              {result === "rejected" && (
                <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">却下済み</span>
              )}
              {!result && state === "loading" && (
                <Loader2 size={18} className="text-slate-400 animate-spin" />
              )}
              {!result && state !== "loading" && (
                <>
                  <button
                    type="button"
                    onClick={() => handle(u.profile_id, "approve")}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                  >
                    <CheckCircle size={12} /> 承認
                  </button>
                  <button
                    type="button"
                    onClick={() => handle(u.profile_id, "reject")}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                  >
                    <XCircle size={12} /> 却下
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
