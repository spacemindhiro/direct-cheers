"use client";

import { Heart } from "lucide-react";

type CheersCardProps = {
  artistName: string;
  eventTitle: string;
  artistAvatar: string | null;
  amount: number;
  nickname?: string | null;
  comment?: string | null;
  transactionId: string;
  paidAt?: string;
  serialNumber?: number | null;
};

function formatSerial(n: number): string {
  return "#" + String(n).padStart(3, "0");
}

export function CheersCard({
  artistName,
  eventTitle,
  artistAvatar,
  amount,
  nickname,
  comment,
  transactionId,
  paidAt,
  serialNumber,
}: CheersCardProps) {
  const dateStr = paidAt
    ? new Date(paidAt).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : new Date().toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 border border-slate-700 shadow-[0_0_60px_rgba(236,72,153,0.15)]">
      {/* 背景装飾 */}
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-pink-500/5 -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-pink-600/5 translate-y-1/2 -translate-x-1/2 blur-3xl pointer-events-none" />

      {/* シリアルナンバー ── カード右上にホイルスタンプ風 */}
      {serialNumber != null && (
        <div className="absolute top-4 right-4 flex flex-col items-end">
          <p className="text-[8px] font-black text-pink-500/60 uppercase tracking-[0.3em] leading-none">
            Serial No.
          </p>
          <p className="text-2xl font-black text-pink-400 italic tracking-tighter leading-none tabular-nums"
            style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatSerial(serialNumber)}
          </p>
        </div>
      )}

      <div className="relative p-6 space-y-5">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-black text-pink-500 uppercase tracking-[0.35em]">
            Direct Cheers
          </p>
          {serialNumber == null && (
            <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[9px] font-black text-green-400 uppercase tracking-wider">
                Confirmed
              </span>
            </div>
          )}
        </div>

        {/* アーティスト */}
        <div className="flex items-center gap-3">
          {artistAvatar ? (
            <img
              src={artistAvatar}
              alt={artistName}
              className="w-12 h-12 rounded-2xl object-cover ring-2 ring-pink-500/30"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-600 to-pink-800 flex items-center justify-center ring-2 ring-pink-500/30">
              <Heart size={20} className="fill-white text-white" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-lg font-black text-white italic uppercase tracking-tighter leading-none truncate">
              {artistName}
            </p>
            <p className="text-xs text-slate-400 font-medium truncate mt-0.5">
              {eventTitle}
            </p>
          </div>
        </div>

        {/* 区切り */}
        <div className="border-t border-slate-700/60" />

        {/* 金額 */}
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            Cheers Amount
          </p>
          <p className="text-4xl font-black text-white italic tracking-tighter">
            ¥{amount.toLocaleString()}
          </p>
        </div>

        {/* メッセージ */}
        {(nickname || comment) && (
          <div className="bg-slate-900/60 rounded-2xl p-4 space-y-1.5 border border-slate-700/40">
            {nickname && (
              <p className="text-xs font-black text-pink-400">{nickname}</p>
            )}
            {comment && (
              <p className="text-sm text-slate-300 leading-relaxed">{comment}</p>
            )}
          </div>
        )}

        {/* フッター */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[9px] text-slate-600 font-mono">
            #{transactionId.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-[9px] text-slate-600">{dateStr}</p>
        </div>
      </div>
    </div>
  );
}
