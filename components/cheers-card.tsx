"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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

// スパークル定義（固定位置、CSS animation でキラキラ）
const SPARKLES = [
  { top: "12%", left: "18%", delay: "0.0s", size: 4 },
  { top: "22%", left: "78%", delay: "0.4s", size: 3 },
  { top: "55%", left: "88%", delay: "0.8s", size: 5 },
  { top: "70%", left: "25%", delay: "0.2s", size: 3 },
  { top: "40%", left: "55%", delay: "1.1s", size: 4 },
  { top: "82%", left: "72%", delay: "0.6s", size: 3 },
  { top: "15%", left: "50%", delay: "1.4s", size: 3 },
];

function useKiraEffect(flipped: boolean) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const [gyroGranted, setGyroGranted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (ny - 0.5) * -18, y: (nx - 0.5) * 18 });
    setActive(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setActive(false);
  }, []);

  // iOS ジャイロ権限リクエスト
  const requestGyro = useCallback(async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
      const state = await (DeviceOrientationEvent as any).requestPermission();
      setGyroGranted(state === "granted");
    } else {
      setGyroGranted(true);
    }
  }, []);

  useEffect(() => {
    // 非iOSは自動で有効
    if (typeof (DeviceOrientationEvent as any).requestPermission !== "function") {
      setGyroGranted(true);
    }
  }, []);

  useEffect(() => {
    if (!gyroGranted) return;
    const NEUTRAL_BETA = 55;
    const handler = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? NEUTRAL_BETA;
      const gamma = e.gamma ?? 0;
      const x = Math.max(-1, Math.min(1, (beta - NEUTRAL_BETA) / 18));
      const y = Math.max(-1, Math.min(1, gamma / 18));
      setTilt({ x: x * -14, y: y * 14 });
      setActive(true);
    };
    window.addEventListener("deviceorientation", handler, { passive: true });
    return () => window.removeEventListener("deviceorientation", handler);
  }, [gyroGranted]);

  // tilt + flip を1つのtransformで合成
  const flipDeg = flipped ? 180 : 0;
  const cardTransform = `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y + flipDeg}deg) scale(${active ? 1.03 : 1})`;
  const cardTransition = active && !flipped ? "transform 0.06s ease-out" : "transform 0.5s cubic-bezier(0.4,0,0.2,1)";

  // エフェクト用の派生値
  const nx = tilt.y / 18 + 0.5; // 0〜1
  const ny = -tilt.x / 18 + 0.5;
  const angle = 110 + tilt.y * 6;
  const intensity = active ? 1 : 0.3;

  // ホログラム箔レイヤー（レインボーストライプ）
  const foilStyle: React.CSSProperties = {
    background: `repeating-linear-gradient(
      ${angle}deg,
      hsla(0,100%,70%,0) 0%, hsla(0,100%,70%,${0.35 * intensity}) 2%,
      hsla(55,100%,70%,0) 4%, hsla(55,100%,70%,${0.35 * intensity}) 6%,
      hsla(110,100%,70%,0) 8%, hsla(110,100%,70%,${0.35 * intensity}) 10%,
      hsla(175,100%,70%,0) 12%, hsla(175,100%,70%,${0.35 * intensity}) 14%,
      hsla(230,100%,70%,0) 16%, hsla(230,100%,70%,${0.35 * intensity}) 18%,
      hsla(285,100%,70%,0) 20%, hsla(285,100%,70%,${0.35 * intensity}) 22%,
      hsla(340,100%,70%,0) 24%, hsla(340,100%,70%,${0.35 * intensity}) 26%
    )`,
    opacity: active ? 0.9 : 0.25,
    mixBlendMode: "screen" as const,
    transition: active ? "opacity 0.1s" : "opacity 0.5s",
  };

  // シャープなグレアスポット
  const glareStyle: React.CSSProperties = {
    background: `
      radial-gradient(circle at ${nx * 100}% ${ny * 100}%, rgba(255,255,255,${0.85 * intensity}) 0%, rgba(255,255,255,0.2) 8%, transparent 25%),
      radial-gradient(ellipse at ${nx * 100}% ${ny * 100}%, rgba(255,200,255,${0.3 * intensity}) 0%, transparent 50%)
    `,
    transition: active ? "background 0.06s" : "background 0.5s",
  };

  // カラー拡散レイヤー
  const diffuseStyle: React.CSSProperties = {
    background: `radial-gradient(ellipse at ${nx * 100}% ${ny * 100}%,
      rgba(236,72,153,${0.3 * intensity}) 0%,
      rgba(99,102,241,${0.2 * intensity}) 30%,
      rgba(6,182,212,${0.15 * intensity}) 60%,
      transparent 80%
    )`,
    transition: active ? "background 0.08s" : "background 0.5s",
  };

  return {
    cardRef,
    cardTransform,
    cardTransition,
    foilStyle,
    glareStyle,
    diffuseStyle,
    active,
    handleMouseMove,
    handleMouseLeave,
    requestGyro,
    gyroGranted,
  };
}

export function CheersCard({
  artistName,
  eventTitle,
  artistAvatar,
  imageUrl,
  amount,
  nickname,
  comment,
  transactionId,
  paidAt,
  serialNumber,
  thanks,
}: CheersCardProps) {
  const [flipped, setFlipped] = useState(false);
  const {
    cardRef,
    cardTransform,
    cardTransition,
    foilStyle,
    glareStyle,
    diffuseStyle,
    active,
    handleMouseMove,
    handleMouseLeave,
    requestGyro,
    gyroGranted,
  } = useKiraEffect(flipped);

  const dateStr = paidAt
    ? new Date(paidAt).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const hasThanks = thanks && (thanks.thanks_message || thanks.thanks_link_url || thanks.thanks_media_url);

  return (
    <>
      {/* スパークルCSS */}
      <style>{`
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <div className="relative select-none" style={{ perspective: "1200px" }}>
        <div
          ref={cardRef}
          className="relative"
          style={{
            transformStyle: "preserve-3d",
            transform: cardTransform,
            transition: cardTransition,
            willChange: "transform",
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={!gyroGranted ? requestGyro : undefined}
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
            {/* ── ホログラム箔 ── */}
            <div className="absolute inset-0 rounded-[1.75rem] pointer-events-none z-10" style={foilStyle} />

            {/* ── カラー拡散 ── */}
            <div className="absolute inset-0 rounded-[1.75rem] pointer-events-none z-20 mix-blend-screen" style={diffuseStyle} />

            {/* ── グレアスポット ── */}
            <div className="absolute inset-0 rounded-[1.75rem] pointer-events-none z-30" style={glareStyle} />

            {/* ── スパークル ── */}
            {active && SPARKLES.map((s, i) => (
              <div
                key={i}
                className="absolute pointer-events-none z-40 rounded-full bg-white"
                style={{
                  top: s.top, left: s.left,
                  width: s.size, height: s.size,
                  boxShadow: `0 0 ${s.size * 2}px ${s.size}px rgba(255,255,255,0.8)`,
                  animation: `sparkle 1.2s ${s.delay} infinite ease-in-out`,
                }}
              />
            ))}

            {/* ── メインコンテンツ ── */}
            <div className="relative z-50">
              {imageUrl && (
                <div className="relative overflow-hidden" style={{ aspectRatio: "3/2" }}>
                  <img src={imageUrl} alt="card image" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-900/80" />
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
                <div className="absolute top-4 right-4 text-right z-40">
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
                  <p className="text-4xl font-black text-white italic tracking-tighter">¥{amount.toLocaleString()}</p>
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

                <div className="flex items-center justify-between pt-1">
                  <p className="text-[9px] text-slate-600 font-mono">#{transactionId.slice(0, 8).toUpperCase()}</p>
                  <p className="text-[9px] text-slate-600">{dateStr}</p>
                </div>
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

        {/* iOS ジャイロ未許可時のヒント */}
        {!gyroGranted && (
          <p className="text-center text-[10px] text-slate-600 mt-2">
            タップしてカードを動かす
          </p>
        )}
      </div>
    </>
  );
}
