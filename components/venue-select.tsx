"use client";

import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Search, X, Loader2, Plus } from "lucide-react";
import { PREFECTURES } from "@/lib/prefectures";

type Venue = { venue_id: string; name: string; prefecture: string; city: string };

// イベント作成フォームの会場選択。会場マスタ(venues)は組織横断で共有するため、
// オートコンプリートで既存会場を検索し、無ければその場で新規登録する。
// 選択結果はhidden inputでvenue_id・会場名(表示用の従来venueテキスト)を親フォームに渡す。
export function VenueSelect({ initialName }: { initialName?: string }) {
  const [query, setQuery] = useState(initialName ?? "");
  const [results, setResults] = useState<Venue[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<Venue | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newVenueError, setNewVenueError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInput = (q: string) => {
    setQuery(q);
    setSelected(null);
    setShowNewForm(false);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/venues/search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setResults(data.venues ?? []);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const newVenueFormRef = useRef<HTMLDivElement>(null);

  // 親(EventCreateForm)の<form>内にネストされるため、内部に<form>要素は置けない
  // （HTML仕様違反でネストしたformの挙動が不定になる）。ボタンクリックで直接処理する。
  const handleCreateVenue = async () => {
    setNewVenueError(null);
    const container = newVenueFormRef.current;
    if (!container) return;
    const get = (name: string) => (container.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";
    const postal_code = get("postal_code");
    const prefecture = get("prefecture");
    const city = get("city");
    const line1 = get("line1");
    if (!postal_code.trim() || !prefecture.trim() || !city.trim() || !line1.trim()) {
      setNewVenueError("郵便番号・都道府県・市区町村・番地は必須です（最寄りの情報でも構いません）");
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch("/api/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: query,
          postal_code,
          prefecture,
          city,
          town: get("town"),
          line1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNewVenueError(data.error ?? "登録に失敗しました");
        return;
      }
      setSelected(data.venue);
      setQuery(data.venue.name);
      setShowNewForm(false);
      setResults([]);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
        <MapPin size={11} className="text-pink-500" /> 会場
      </label>

      {/* 従来のvenueテキストカラム用（表示名として維持） */}
      <input type="hidden" name="venue" value={selected?.name ?? query} />
      <input type="hidden" name="venue_id" value={selected?.venue_id ?? ""} />

      <div className="relative">
        <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="例: WOMB, Shibuya"
          required
          className="h-14 pl-9 bg-slate-950/50 border-slate-700 rounded-2xl text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {isSearching && (
        <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
          <Loader2 size={12} className="animate-spin" /> 検索中...
        </div>
      )}

      {!isSearching && !selected && results.length > 0 && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
          {results.map((v) => (
            <button
              key={v.venue_id}
              type="button"
              onClick={() => { setSelected(v); setQuery(v.name); setResults([]); }}
              className="w-full flex items-center justify-between px-5 py-3 text-sm text-left hover:bg-slate-800 transition-colors border-b border-slate-800 last:border-0"
            >
              <span className="font-bold text-white">{v.name}</span>
              <span className="text-[10px] text-slate-500">{v.prefecture}{v.city}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <p className="text-[10px] text-emerald-400 font-bold px-1">
          登録済みの会場情報を使用します（{selected.prefecture}{selected.city}）
        </p>
      )}

      {!isSearching && !selected && query.trim().length > 0 && results.length === 0 && !showNewForm && (
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-pink-400 transition-colors px-1"
        >
          <Plus size={13} /> 「{query}」を新しい会場として登録
        </button>
      )}

      {showNewForm && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-pink-400 uppercase tracking-widest">新規会場登録</p>
            <button type="button" onClick={() => setShowNewForm(false)} className="text-slate-500 hover:text-white">
              <X size={14} />
            </button>
          </div>

          <div className="bg-pink-500/5 border border-pink-500/20 rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              📍 正確な住所がなくてもOK<br />
              野外・キャンプ地など正式な住所がない会場は、最寄りの地名・郵便番号で構いません。決済端末の識別用の情報であり、来場者向けの案内地図ではありません。
            </p>
          </div>

          <div ref={newVenueFormRef} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">郵便番号</label>
                <input
                  name="postal_code"
                  placeholder="例: 400-0000"
                  className="w-full h-11 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs text-white placeholder:text-slate-600 focus:border-pink-500 outline-none"
                />
                <p className="text-[9px] text-slate-600">不明な場合は最寄りの地域の番号でも可</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">都道府県</label>
                <select
                  name="prefecture"
                  defaultValue=""
                  className="w-full h-11 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs text-white focus:border-pink-500 outline-none"
                >
                  <option value="" disabled>選択</option>
                  {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">市区町村</label>
              <input
                name="city"
                placeholder="例: 北杜市"
                className="w-full h-11 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs text-white placeholder:text-slate-600 focus:border-pink-500 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">町名（任意）</label>
              <input
                name="town"
                placeholder="例: 大泉町"
                className="w-full h-11 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs text-white placeholder:text-slate-600 focus:border-pink-500 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">番地</label>
              <input
                name="line1"
                placeholder="例: 1-1-1"
                className="w-full h-11 bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs text-white placeholder:text-slate-600 focus:border-pink-500 outline-none"
              />
              <p className="text-[9px] text-slate-600">正確な番地が不明な場合は、現地までの目印でも登録できます（例：白いゲート前）</p>
            </div>

            {newVenueError && <p className="text-[10px] text-red-400 font-bold">{newVenueError}</p>}

            <button
              type="button"
              onClick={handleCreateVenue}
              disabled={isCreating}
              className="w-full h-11 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isCreating ? <Loader2 size={14} className="animate-spin" /> : "この内容で会場を登録"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
