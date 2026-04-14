"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2, MapPin, Calendar, Music, Hash, Search, X, Plus } from "lucide-react";

type Artist = { profile_id: string; display_name: string };

export function EventCreateForm({
  connectedArtists,
}: {
  connectedArtists: Artist[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedArtists, setSelectedArtists] = useState<Artist[]>([]);
  const [serialScope, setSerialScope] = useState<"event" | "artist">("event");

  // 新規アーティスト検索
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Artist[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedIds = new Set(selectedArtists.map((a) => a.profile_id));

  const toggleArtist = (artist: Artist) => {
    setSelectedArtists((prev) =>
      selectedIds.has(artist.profile_id)
        ? prev.filter((a) => a.profile_id !== artist.profile_id)
        : [...prev, artist]
    );
  };

  const handleSearchInput = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/artists/search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setSearchResults(data.artists ?? []);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = fd.get("title") as string;
    const venue = fd.get("venue") as string;
    const start_at = fd.get("start_at") as string;
    const end_at = fd.get("end_at") as string;

    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/events/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          venue,
          start_at,
          end_at,
          artist_ids: selectedArtists.map((a) => a.profile_id),
          serial_scope: serialScope,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      router.push(`/dashboard/events/${data.event_id}`);
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-6">

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            イベントタイトル
          </label>
          <Input
            name="title"
            placeholder="例: UNDERGROUND NIGHT vol.1"
            required
            className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
            <MapPin size={11} className="text-pink-500" /> 会場
          </label>
          <Input
            name="venue"
            placeholder="例: WOMB, Shibuya"
            required
            className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <Calendar size={11} className="text-pink-500" /> 開始
            </label>
            <Input
              name="start_at"
              type="datetime-local"
              required
              className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              終了
            </label>
            <Input
              name="end_at"
              type="datetime-local"
              required
              className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        {/* 出演アーティスト */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
            <Music size={11} className="text-pink-500" /> 出演アーティスト
          </label>

          {/* 選択済みチップ */}
          {selectedArtists.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedArtists.map((a) => {
                const isConnected = connectedArtists.some((c) => c.profile_id === a.profile_id);
                return (
                  <span
                    key={a.profile_id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-pink-500/15 border border-pink-500/40 text-pink-300"
                  >
                    {a.display_name}
                    {!isConnected && (
                      <span className="text-[9px] font-medium text-pink-500/70 uppercase tracking-widest">
                        NEW
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleArtist(a)}
                      className="ml-0.5 text-pink-400/60 hover:text-pink-300"
                    >
                      <X size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* コネクション済みアーティスト */}
          {connectedArtists.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                コネクション済み — 全員承認が必要です
              </p>
              <div className="flex flex-wrap gap-2">
                {connectedArtists.map((a) => (
                  <button
                    key={a.profile_id}
                    type="button"
                    onClick={() => toggleArtist(a)}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                      selectedIds.has(a.profile_id)
                        ? "bg-pink-500 text-white shadow-[0_0_20px_rgba(236,72,153,0.3)]"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700"
                    }`}
                  >
                    {a.display_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 新規アーティストを検索 */}
          {!searchMode ? (
            <button
              type="button"
              onClick={() => setSearchMode(true)}
              className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-pink-400 transition-colors"
            >
              <Plus size={13} /> 新規アーティストに依頼
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <Input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    placeholder="アーティスト名で検索..."
                    className="h-11 pl-9 bg-slate-950/50 border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setSearchMode(false); setSearchQuery(""); setSearchResults([]); }}
                  className="text-slate-500 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {isSearching && (
                <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
                  <Loader2 size={12} className="animate-spin" /> 検索中...
                </div>
              )}

              {!isSearching && searchResults.length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
                  {searchResults.map((a) => (
                    <button
                      key={a.profile_id}
                      type="button"
                      onClick={() => {
                        toggleArtist(a);
                        setSearchQuery("");
                        setSearchResults([]);
                      }}
                      disabled={selectedIds.has(a.profile_id)}
                      className="w-full flex items-center justify-between px-5 py-3 text-sm text-left hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-default border-b border-slate-800 last:border-0"
                    >
                      <span className="font-bold text-white">{a.display_name}</span>
                      {selectedIds.has(a.profile_id) ? (
                        <span className="text-[9px] font-black text-pink-400 uppercase tracking-widest">選択済み</span>
                      ) : (
                        <Plus size={14} className="text-slate-500" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {!isSearching && searchQuery.length > 0 && searchResults.length === 0 && (
                <p className="text-xs text-slate-600 px-1">
                  「{searchQuery}」に一致するアーティストが見つかりません
                </p>
              )}
            </div>
          )}
        </div>

        {/* シリアル番号スコープ */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
            <Hash size={11} className="text-pink-500" /> シリアル番号の採番単位
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(["event", "artist"] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setSerialScope(scope)}
                className={`px-4 py-3 rounded-2xl text-xs font-black transition-all text-left space-y-0.5 border ${
                  serialScope === scope
                    ? "bg-pink-500/10 border-pink-500/40 text-pink-400"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <p className="uppercase tracking-widest">
                  {scope === "event" ? "イベント通し" : "アーティスト別"}
                </p>
                <p className="text-[9px] font-medium text-slate-500 normal-case tracking-normal">
                  {scope === "event"
                    ? "全出演者合算で #001, #002..."
                    : "アーティストごとに #001, #002..."}
                </p>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-400 font-bold">{error}</p>}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-6 w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? <Loader2 size={20} className="animate-spin" /> : <>イベントを作成 <ArrowRight size={18} /></>}
      </button>
    </form>
  );
}
