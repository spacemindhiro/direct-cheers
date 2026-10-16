"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Plus, Check } from "lucide-react";
import type { DirectoryProfile } from "@/lib/directory";
import { DirectoryProfileView } from "@/components/directory-profile-view";

// 照会のポップアップ。入力中のフォームを離れずに相手のプロフィールを確かめ、そのまま出演者に追加できる。
// 表示内容は照会APIの出し分けに従う（organizer には公開項目のみ）
export function DirectoryProfileModal({
  profileId,
  added,
  onAdd,
  onClose,
}: {
  profileId: string;
  added: boolean;
  onAdd: (p: DirectoryProfile) => void;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<DirectoryProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setProfile(null);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/directory/${profileId}`, { signal: controller.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(res.status === 404 ? "このユーザーは照会できません" : json.error ?? "照会に失敗しました");
        setProfile(json.profile);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      }
    })();
    return () => controller.abort();
  }, [profileId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[90dvh] flex flex-col bg-slate-950 border border-slate-800 rounded-t-[2rem] sm:rounded-[2rem] pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">照会</p>
          <button type="button" onClick={onClose} aria-label="閉じる" className="text-slate-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {!profile && !error && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-slate-600" size={28} />
            </div>
          )}
          {error && <p className="text-sm text-red-400 py-10 text-center">{error}</p>}
          {profile && <DirectoryProfileView profile={profile} />}
        </div>

        {profile && (
          <div className="px-6 py-4 border-t border-slate-800">
            <button
              type="button"
              disabled={added}
              onClick={() => onAdd(profile)}
              className="w-full h-12 rounded-2xl bg-pink-500 text-white text-sm font-black tracking-widest flex items-center justify-center gap-2 hover:brightness-110 disabled:bg-slate-800 disabled:text-slate-400"
            >
              {added ? <><Check size={16} /> 出演者に追加済み</> : <><Plus size={16} /> 出演者に追加</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
