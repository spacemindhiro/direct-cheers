"use client";

import { useEffect, useRef } from "react";
import { Calendar, MapPin, CheckCircle, XCircle, Clock } from "lucide-react";

type DigitalTicketProps = {
  ticketId: string;
  ticketCode: string;
  eventTitle: string;
  productName: string;
  eventVenue?: string | null;
  startAt?: string | null;
  holderEmail: string;
  status: "valid" | "used" | "cancelled";
  checkedInAt?: string | null;
  paymentType: "A" | "B" | "C";
  amount: number;
};

export function DigitalTicket({
  ticketId,
  ticketCode,
  eventTitle,
  productName,
  eventVenue,
  startAt,
  holderEmail,
  status,
  checkedInAt,
  paymentType,
  amount,
}: DigitalTicketProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    // ブラウザ専用ライブラリを動的ロード
    import("qrcode").then(({ default: QRCode }) => {
      QRCode.toCanvas(canvasRef.current!, ticketCode, {
        width: 180,
        margin: 1,
        color: {
          dark: "#ffffff",
          light: "#0f172a",
        },
      }).catch(console.error);
    });
  }, [ticketCode]);

  const statusConfig = {
    valid: {
      label: "有効",
      color: "text-green-400",
      bg: "bg-green-500/10 border-green-500/30",
      icon: <CheckCircle size={12} className="text-green-400" />,
    },
    used: {
      label: "入場済み",
      color: "text-slate-400",
      bg: "bg-slate-700/50 border-slate-600",
      icon: <CheckCircle size={12} className="text-slate-400" />,
    },
    cancelled: {
      label: "キャンセル済み",
      color: "text-red-400",
      bg: "bg-red-500/10 border-red-500/30",
      icon: <XCircle size={12} className="text-red-400" />,
    },
  };

  const paymentTypeLabel = {
    A: "5日前確定",
    B: "即時確定",
    C: "当日決済",
  };

  const st = statusConfig[status];
  const isUsed = status === "used";

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border shadow-[0_0_60px_rgba(99,102,241,0.15)] ${
        isUsed
          ? "bg-slate-800/60 border-slate-700"
          : "bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950/60 border-indigo-500/30"
      }`}
    >
      {/* 背景装飾 */}
      {!isUsed && (
        <>
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-indigo-500/5 -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-violet-600/5 translate-y-1/2 -translate-x-1/2 blur-3xl pointer-events-none" />
        </>
      )}

      {/* 使用済みオーバーレイ */}
      {isUsed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div
            className="text-slate-600/30 font-black text-6xl italic uppercase tracking-widest"
            style={{ transform: "rotate(-30deg)" }}
          >
            USED
          </div>
        </div>
      )}

      <div className="relative p-6 space-y-5">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.35em]">
            Digital Ticket
          </p>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${st.bg}`}>
            {st.icon}
            <span className={st.color}>{st.label}</span>
          </div>
        </div>

        {/* イベント名・チケット種別 */}
        <div>
          <p className="text-xl font-black text-white italic uppercase tracking-tighter leading-tight">
            {eventTitle}
          </p>
          <p className="text-sm text-indigo-300 font-bold mt-1">{productName}</p>
        </div>

        {/* イベント情報 */}
        <div className="space-y-1.5">
          {startAt && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Calendar size={12} className="text-indigo-400 shrink-0" />
              {new Date(startAt).toLocaleString("ja-JP", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
          {eventVenue && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <MapPin size={12} className="text-indigo-400 shrink-0" />
              {eventVenue}
            </div>
          )}
        </div>

        {/* ミシン目 */}
        <div className="relative py-1">
          <div className="absolute left-0 top-1/2 w-5 h-5 rounded-full bg-slate-950 -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute right-0 top-1/2 w-5 h-5 rounded-full bg-slate-950 translate-x-1/2 -translate-y-1/2" />
          <div className="border-t border-dashed border-slate-700" />
        </div>

        {/* QR コード */}
        <div className="flex items-center justify-center py-2">
          <div className={`p-3 rounded-2xl ${isUsed ? "opacity-30" : ""}`} style={{ background: "#0f172a" }}>
            <canvas ref={canvasRef} />
          </div>
        </div>

        {/* チケット下部情報 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900/60 rounded-2xl px-4 py-3 border border-slate-700/40">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Amount</p>
            <p className="text-lg font-black text-white italic tabular-nums mt-0.5">
              {paymentType === "C" ? `¥${amount.toLocaleString()}` : `¥${amount.toLocaleString()}`}
            </p>
            {paymentType === "C" && (
              <p className="text-[9px] text-amber-400 font-bold mt-0.5">入場時決済</p>
            )}
          </div>
          <div className="bg-slate-900/60 rounded-2xl px-4 py-3 border border-slate-700/40">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Plan</p>
            <p className="text-sm font-black text-indigo-300 mt-0.5">{paymentType}タイプ</p>
            <p className="text-[9px] text-slate-500">{paymentTypeLabel[paymentType]}</p>
          </div>
        </div>

        {/* 入場済み情報 */}
        {checkedInAt && (
          <div className="flex items-center gap-2 bg-green-500/5 border border-green-500/15 rounded-xl px-4 py-2.5">
            <Clock size={12} className="text-green-400 shrink-0" />
            <p className="text-xs text-green-400 font-bold">
              {new Date(checkedInAt).toLocaleString("ja-JP", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })} に入場済み
            </p>
          </div>
        )}

        {/* フッター */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[9px] text-slate-600 font-mono">
            #{ticketId.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-[9px] text-slate-600 truncate max-w-[140px]">{holderEmail}</p>
        </div>
      </div>
    </div>
  );
}
