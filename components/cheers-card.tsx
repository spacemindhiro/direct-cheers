"use client";

import { DISPLAY_TZ } from "@/lib/display-tz";
import { useState } from "react";
import { Heart, RotateCcw, ExternalLink, Gift } from "lucide-react";

type ThanksData = {
  thanks_message: string | null;
  thanks_link_url: string | null;
  thanks_media_url: string | null;
};

type CheersCardProps = {
  artistName: string;
  eventTitle: string;
  artistAvatar: string | null;
  imageUrl?: string | null;
  amount: number;
  welcomeCheerAmount?: number | null;
  nickname?: string | null;
  comment?: string | null;
  transactionId: string;
  paidAt?: string;
  serialNumber?: number | null;
  thanks?: ThanksData | null;
};

function formatSerial(n: number): string {
  return "#" + String(n).padStart(3, "0");
}

export function CheersCard({
  artistName,
  eventTitle,
  artistAvatar,
  imageUrl,
  amount,
  welcomeCheerAmount,
  nickname,
  comment,
  transactionId,
  paidAt,
  serialNumber,
  thanks,
}: CheersCardProps) {
  const [flipped, setFlipped] = useState(false);

  const dateStr = paidAt
    ? new Date(paidAt).toLocaleDateString("ja-JP", { timeZone: DISPLAY_TZ, year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : new Date().toLocaleDateString("ja-JP", { timeZone: DISPLAY_TZ, year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const hasThanks = thanks && (thanks.thanks_message || thanks.thanks_link_url || thanks.thanks_media_url);

  return (
    <div className="relative select-none" style={{ perspective: "1200px" }}>
      <div
        className="relative"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          transition: "transform 0.55s cubic-bezier(0.4,0,0.2,1)",
          willChange: "transform",
        }}
      >

        {/* ──────────── 表面 ──────────── */}
        <div
          className="relative overflow-hidden rounded-[1.75rem] border shadow-[0_12px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.07)]"
          style={{
            backfaceVisibility: "hidden",
            background: "linear-gradient(145deg, #1e293b 0%, #0f172a 60%, #1a0a1e 100%)",
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          {imageUrl && (
            <div className="relative overflow-hidden" style={{ aspectRatio: "3/2" }}>
              <img src={imageUrl} alt="card image" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-900/80" />
              {/* 画像内のテキストより常に最新名を優先表示（ウォレットの logoText 相当） */}
              <div className="absolute bottom-3 left-4 right-12">
                <p className="text-base font-black text-white italic uppercase tracking-tight leading-none drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)] truncate">
                  {artistName}
                </p>
              </div>
              {serialNumber != null && (
                <div className="absolute top-3 right-3 text-right">
                  <p className="text-[8px] font-black text-pink-300/70 uppercase tracking-[0.3em] leading-none">Serial No.</p>
                  <p className="text-xl font-black text-white italic tabular-nums leading-none drop-shadow-lg">
                    {formatSerial(serialNumber)}
                  </p>
                </div>
              )}
            </div>
          )}

          {!imageUrl && serialNumber != null && (
            <div className="absolute top-4 right-4 text-right z-10">
              <p className="text-[8px] font-black text-pink-500/60 uppercase tracking-[0.3em] leading-none">Serial No.</p>
              <p className="text-2xl font-black text-pink-400 italic tracking-tighter leading-none tabular-nums">
                {formatSerial(serialNumber)}
              </p>
            </div>
          )}

          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black text-pink-500 uppercase tracking-[0.35em]">Direct Cheers</p>
              {serialNumber == null && (
                <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[9px] font-black text-green-400 uppercase tracking-wider">Confirmed</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {artistAvatar ? (
                <img src={artistAvatar} alt={artistName} className="w-12 h-12 rounded-2xl object-cover ring-2 ring-pink-500/30" />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-600 to-pink-800 flex items-center justify-center ring-2 ring-pink-500/30">
                  <Heart size={20} className="fill-white text-white" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-lg font-black text-white italic uppercase tracking-tighter leading-none truncate">{artistName}</p>
                <p className="text-xs text-slate-400 font-medium truncate mt-0.5">{eventTitle}</p>
              </div>
            </div>

            <div className="border-t border-white/5" />

            <div className="flex items-baseline justify-between">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cheers Amount</p>
              <div className="text-right">
                <p className="text-4xl font-black text-white italic tracking-tighter">¥{amount.toLocaleString()}</p>
                {!!welcomeCheerAmount && (
                  <p className="text-[10px] font-bold text-indigo-300">
                    うちウェルカムチア ¥{welcomeCheerAmount.toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {(nickname || comment) && (
              <div className="bg-white/5 rounded-2xl p-4 space-y-1.5 border border-white/5">
                {nickname && <p className="text-xs font-black text-pink-400">{nickname}</p>}
                {comment && <p className="text-sm text-slate-300 leading-relaxed">{comment}</p>}
              </div>
            )}

            {hasThanks && (
              <button
                type="button"
                onClick={() => setFlipped(true)}
                className="w-full flex items-center justify-between gap-3 bg-gradient-to-r from-pink-500/10 to-pink-600/5 border border-pink-500/30 rounded-2xl px-4 py-3 hover:border-pink-500/50 transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-pink-500/15 flex items-center justify-center shrink-0">
                    <Gift size={14} className="text-pink-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-black text-pink-400 uppercase tracking-widest leading-none">Thanks Gift</p>
                    <p className="text-xs text-slate-400 mt-0.5">{artistName} からお返しが届いています</p>
                  </div>
                </div>
                <RotateCcw size={14} className="text-pink-500/60 group-hover:text-pink-400 transition-colors shrink-0" />
              </button>
            )}

            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Transaction ID</p>
                <p className="text-[9px] text-slate-600">{dateStr}</p>
              </div>
              <p className="text-[9px] text-slate-500 font-mono break-all">{transactionId}</p>
            </div>
          </div>
        </div>

        {/* ──────────── 裏面 ──────────── */}
        {hasThanks && (
          <div
            className="absolute inset-0 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-slate-900 via-slate-900 to-pink-950/30 border border-pink-500/30 shadow-[0_0_60px_rgba(236,72,153,0.2)]"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-pink-500/10 -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
            <div className="relative p-6 space-y-5 h-full flex flex-col">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gift size={14} className="text-pink-400" />
                  <p className="text-[9px] font-black text-pink-400 uppercase tracking-[0.35em]">Thanks Gift</p>
                </div>
                <button type="button" onClick={() => setFlipped(false)}
                  className="flex items-center gap-1 text-slate-500 hover:text-slate-300 text-[10px] font-bold transition-colors">
                  <RotateCcw size={11} /> カードに戻る
                </button>
              </div>

              <div className="flex items-center gap-3">
                {artistAvatar ? (
                  <img src={artistAvatar} alt={artistName} className="w-10 h-10 rounded-xl object-cover ring-2 ring-pink-500/30 shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-600 to-pink-800 flex items-center justify-center ring-2 ring-pink-500/30 shrink-0">
                    <Heart size={16} className="fill-white text-white" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-black text-white italic uppercase tracking-tight">{artistName}</p>
                  <p className="text-[10px] text-pink-300/70">からあなたへ</p>
                </div>
              </div>

              <div className="border-t border-pink-500/20" />

              <div className="flex-1 space-y-4">
                {thanks.thanks_message && (
                  <div className="bg-pink-500/5 border border-pink-500/15 rounded-2xl p-4">
                    <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{thanks.thanks_message}</p>
                  </div>
                )}
                {thanks.thanks_media_url && (
                  <div className="rounded-2xl overflow-hidden border border-slate-700">
                    <img src={thanks.thanks_media_url} alt="thanks media" className="w-full object-cover max-h-40" />
                  </div>
                )}
                {thanks.thanks_link_url && (
                  <a href={thanks.thanks_link_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 bg-pink-500/10 border border-pink-500/25 hover:border-pink-500/50 rounded-2xl px-4 py-3 transition-all group">
                    <div>
                      <p className="text-[10px] font-black text-pink-400 uppercase tracking-widest">Special Link</p>
                      <p className="text-xs text-slate-400 truncate max-w-[180px] mt-0.5">{thanks.thanks_link_url}</p>
                    </div>
                    <ExternalLink size={16} className="text-pink-500 shrink-0 group-hover:text-pink-400 transition-colors" />
                  </a>
                )}
              </div>

              <p className="text-[9px] text-pink-500/30 font-bold uppercase tracking-widest text-center">
                Direct Cheers — Exclusive for Supporters
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
