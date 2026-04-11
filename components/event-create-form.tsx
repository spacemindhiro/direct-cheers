"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { ArrowRight, Loader2, MapPin, Calendar, Music, Hash } from "lucide-react";

type Artist = { profile_id: string; display_name: string };

export function EventCreateForm({ artists }: { artists: Artist[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [serialScope, setSerialScope] = useState<"event" | "artist">("event");

  const toggleArtist = (id: string) => {
    setSelectedArtists((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
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
        body: JSON.stringify({ title, venue, start_at, end_at, artist_ids: selectedArtists, serial_scope: serialScope }),
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

        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
            <Music size={11} className="text-pink-500" /> 出演アーティスト
          </label>
          {artists.length === 0 ? (
            <p className="text-xs text-slate-600">コネクションがありません</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {artists.map((a) => (
                <button
                  key={a.profile_id}
                  type="button"
                  onClick={() => toggleArtist(a.profile_id)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                    selectedArtists.includes(a.profile_id)
                      ? "bg-pink-500 text-white shadow-[0_0_20px_rgba(236,72,153,0.3)]"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700"
                  }`}
                >
                  {a.display_name}
                </button>
              ))}
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
