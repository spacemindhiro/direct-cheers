"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Loader2, ChevronRight, UserCircle, Check } from "lucide-react";
import type { DirectorySearchItem, DirectoryType } from "@/lib/directory";

const TYPE_LABELS: Record<DirectoryType, string> = {
  artist: "アーティスト",
  organizer: "オーガナイザー",
};

export function DirectorySearch({ types }: { types: DirectoryType[] }) {
  // 種別ごとにオン/オフ。初期は全部オン、最後の1つはオフにできない
  const [selected, setSelected] = useState<DirectoryType[]>(types);
  const toggle = (t: DirectoryType) =>
    setSelected((cur) =>
      cur.includes(t)
        ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur)
        : types.filter((x) => x === t || cur.includes(x)),
    );
  const selectedKey = selected.join(",");
  const selectedLabel = selected.map((t) => TYPE_LABELS[t]).join("・");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DirectorySearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/directory/search?types=${selectedKey}&q=${encodeURIComponent(q.trim())}`,
          { signal: controller.signal },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "検索に失敗しました");
        setResults(json.results ?? []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, selectedKey]);

  return (
    <div className="space-y-6">
      {types.length > 1 && (
        <div className="flex gap-2">
          {types.map((t) => {
            const on = selected.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(t)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-colors ${
                  on
                    ? "bg-pink-500/10 border-pink-500/40 text-pink-400"
                    : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
              >
                {on ? <Check size={12} /> : <span className="w-3" />}
                {TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`${selectedLabel}の名前で検索`}
          className="w-full bg-slate-950/50 border border-slate-800 rounded-xl pl-12 pr-5 py-3 text-sm text-white focus:border-pink-500/50 outline-none transition-all placeholder:text-slate-700"
        />
        {loading && (
          <Loader2 size={16} className="absolute right-5 top-1/2 -translate-y-1/2 animate-spin text-slate-600" />
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {q.trim() && !loading && !error && results.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
          <p className="text-slate-600 text-sm font-bold">該当する{selectedLabel}はいません</p>
        </div>
      )}

      <div className="space-y-3">
        {results.map((r) => (
          <Link
            key={r.profile_id}
            href={`/dashboard/directory/${r.profile_id}`}
            className="flex items-center gap-4 bg-slate-900 border border-slate-800 hover:border-pink-500/40 rounded-[1.5rem] px-5 py-4 transition-all group"
          >
            {r.avatar_url ? (
              <img src={r.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
            ) : (
              <UserCircle size={44} className="text-slate-700 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white truncate group-hover:text-pink-400 transition-colors">{r.name}</p>
              {r.sub && <p className="text-xs text-slate-500 truncate">{r.sub}</p>}
              {selected.length > 1 && (
                <div className="flex gap-1.5 mt-1">
                  {r.matched.map((m) => (
                    <span key={m} className="px-2 py-0.5 rounded-md text-[10px] font-black border border-slate-700 text-slate-400">
                      {TYPE_LABELS[m]}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <ChevronRight size={16} className="text-slate-600 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
