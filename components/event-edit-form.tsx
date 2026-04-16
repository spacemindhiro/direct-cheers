"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2, Search, X, Plus } from "lucide-react";

type Artist = { profile_id: string; display_name: string };

type EventEditFormProps = {
  eventId: string;
  defaultValues: {
    title: string;
    venue: string;
    start_at: string;
    end_at: string;
  };
  currentArtists: Artist[];
  connectedArtists: Artist[];
  lifecycleStatus: string;
};

export function EventEditForm({
  eventId,
  defaultValues,
  currentArtists,
  connectedArtists,
  lifecycleStatus,
}: EventEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [selectedArtists, setSelectedArtists] = useState<Artist[]>(currentArtists);

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
        : [...prev, artist],
    );
  };

  const handleSearchInput = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 1) { setSearchResults([]); return; }
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
    setWarning(null);
    const fd = new FormData(e.currentTarget);
    const title = fd.get("title") as string;
    const venue = fd.get("venue") as string;
    const start_at = fd.get("start_at") as string;
    const end_at = fd.get("end_at") as string;

    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          venue,
          start_at,
          end_at,
          artist_ids: selectedArtists.map((a) => a.profile_id),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      if (data.re_approval_required) {
        setWarning("日程・場所の変更により、エージェントの再承認が必要になりました。");
      }
      router.push(`/dashboard/events/${eventId}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-6">

        {lifecycleStatus !== "draft" && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
            <p className="text-xs text-amber-400 font-bold">
              日程・場所を変更すると承認待ちに戻り、エージェントの再承認が必要になります。
            </p>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            イベントタイトル
          </label>
          <Input
            name="title"
            defaultValue={defaultValues.title}
            required
            className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            会場
          </label>
          <Input
            name="venue"
            defaultValue={defaultValues.venue}
            required
            className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              開始
            </label>
            <input
              name="start_at"
              type="datetime-local"
              defaultValue={defaultValues.start_at}
              required
              className="block w-full min-h-[3.5rem] bg-slate-950/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-white focus:border-pink-500 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              終了
            </label>
            <input
              name="end_at"
              type="datetime-local"
              defaultValue={defaultValues.end_at}
              required
              className="block w-full min-h-[3.5rem] bg-slate-950/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-white focus:border-pink-500 outline-none"
            />
          </div>
        </div>

        {/* 出演アーティスト */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            出演アーティスト
          </label>

          {selectedArtists.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedArtists.map((a) => (
                <span
                  key={a.profile_id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-pink-500/15 border border-pink-500/40 text-pink-300"
                >
                  {a.display_name}
                  <button
                    type="button"
                    onClick={() => toggleArtist(a)}
                    className="ml-0.5 text-pink-400/60 hover:text-pink-300"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {connectedArtists.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                コネクション済み
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

          {!searchMode ? (
            <button
              type="button"
              onClick={() => setSearchMode(true)}
              className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-pink-400 transition-colors"
            >
              <Plus size={13} /> アーティストを追加
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
                      onClick={() => { toggleArtist(a); setSearchQuery(""); setSearchResults([]); }}
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
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400 font-bold">{error}</p>}
        {warning && <p className="text-sm text-amber-400 font-bold">{warning}</p>}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-6 w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? <Loader2 size={20} className="animate-spin" /> : <>変更を保存 <ArrowRight size={18} /></>}
      </button>
    </form>
  );
}
