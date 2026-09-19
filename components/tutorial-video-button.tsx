"use client";

import { useEffect } from "react";
import { useState } from "react";
import { Play, X } from "lucide-react";

// youtubeId が未確定（まだYouTubeにアップロードしていない）場合は
// リンク切れのiframeを出さないよう、ボタン自体を表示しない
export function TutorialVideoButton({
  youtubeId,
  label,
  compact = false,
}: {
  youtubeId?: string;
  label?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!youtubeId) return null;

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label ?? "動画で見る"}
          className="relative w-10 h-7 rounded-md overflow-hidden shrink-0 border border-slate-700 bg-slate-900 group"
        >
          <img
            src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
            alt=""
            className="w-full h-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
            <Play size={10} className="text-white fill-white" />
          </span>
        </button>
        {open && <TutorialVideoModal youtubeId={youtubeId} onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 shrink-0 group"
      >
        <span className="relative w-14 h-8 rounded-lg overflow-hidden shrink-0 border border-slate-700 bg-slate-900">
          <img
            src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
            alt=""
            className="w-full h-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
            <Play size={12} className="text-white fill-white" />
          </span>
        </span>
        <span className="text-[10px] font-bold text-indigo-300 group-hover:text-indigo-200 whitespace-nowrap">
          {label ?? "動画で見る"}
        </span>
      </button>
      {open && <TutorialVideoModal youtubeId={youtubeId} onClose={() => setOpen(false)} />}
    </>
  );
}

function TutorialVideoModal({
  youtubeId,
  onClose,
}: {
  youtubeId: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 landscape:p-0"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl landscape:max-w-none landscape:w-screen landscape:h-screen"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="absolute -top-10 right-0 landscape:top-2 landscape:right-2 landscape:z-10 text-white/80 hover:text-white"
        >
          <X size={28} />
        </button>
        <div className="aspect-video landscape:aspect-auto landscape:w-screen landscape:h-screen">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
            title="操作解説動画"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            className="w-full h-full rounded-2xl landscape:rounded-none border-0"
          />
        </div>
      </div>
    </div>
  );
}
