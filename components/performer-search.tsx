"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X, Plus, UserCircle, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { DirectorySearchItem } from "@/lib/directory";
import { DirectoryProfileModal } from "@/components/directory-profile-modal";

type Performer = { profile_id: string; display_name: string };

// イベント作成・編集の出演者検索。照会機能（/api/directory）で探し、ポップアップで照会してから追加できる。
// 検索対象は照会のアーティスト検索と同じ（artist/organizer/agent）。保存APIも同じ条件で検証している
export function PerformerSearch({
  selectedIds,
  onAdd,
  onClose,
}: {
  selectedIds: Set<string>;
  onAdd: (p: Performer) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DirectorySearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/directory/search?types=artist&q=${encodeURIComponent(q.trim())}`, {
          signal: controller.signal,
        });
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
  }, [q]);

  const add = (p: Performer) => {
    onAdd(p);
    setQ("");
    setResults([]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="アーティスト名で検索..."
            className="h-11 pl-9 bg-slate-950/50 border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
          <Loader2 size={12} className="animate-spin" /> 検索中...
        </div>
      )}

      {error && <p className="text-xs text-red-400 px-1">{error}</p>}

      {!loading && !error && results.length > 0 && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
          {results.map((r) => {
            const selected = selectedIds.has(r.profile_id);
            return (
              <div key={r.profile_id} className="flex items-center gap-2 pr-3 border-b border-slate-800 last:border-0">
                {/* 名前の部分をタップすると照会（狭い画面でも名前を削らないよう、照会は専用ボタンにしない） */}
                <button
                  type="button"
                  onClick={() => setViewingId(r.profile_id)}
                  aria-label={`${r.name}を照会`}
                  className="min-w-0 flex-1 flex items-center gap-3 pl-4 py-3 text-left hover:bg-slate-900 transition-colors"
                >
                  {r.avatar_url ? (
                    <img src={r.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <UserCircle size={36} className="text-slate-700 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white truncate">{r.name}</span>
                    <span className="flex items-center gap-1 text-xs text-slate-500 truncate">
                      {r.sub && <span className="truncate">{r.sub}</span>}
                      <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-black text-slate-600">
                        {r.sub && "・"}<Eye size={11} /> 照会
                      </span>
                    </span>
                  </span>
                </button>
                {selected ? (
                  <span className="shrink-0 w-12 text-center text-[9px] font-black text-pink-400 uppercase tracking-widest">選択済み</span>
                ) : (
                  <button
                    type="button"
                    aria-label={`${r.name}を出演者に追加`}
                    onClick={() => add({ profile_id: r.profile_id, display_name: r.name })}
                    className="shrink-0 w-12 inline-flex items-center justify-center py-2 rounded-lg bg-pink-500/10 border border-pink-500/30 text-pink-300 hover:bg-pink-500/20"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && q.trim().length > 0 && results.length === 0 && (
        <p className="text-xs text-slate-600 px-1">「{q}」に一致するアーティストが見つかりません</p>
      )}

      {viewingId && (
        <DirectoryProfileModal
          profileId={viewingId}
          added={selectedIds.has(viewingId)}
          onAdd={(p) => {
            add({ profile_id: p.profile_id, display_name: p.artist_name || p.display_name });
            setViewingId(null);
          }}
          onClose={() => setViewingId(null)}
        />
      )}
    </div>
  );
}
