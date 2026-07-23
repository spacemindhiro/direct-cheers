"use client";

import { DISPLAY_TZ } from "@/lib/display-tz";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, MapPin, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";

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
  paymentType: "A" | "B" | "C" | "V" | "D" | null;
  productType?: string;
  amount: number;
  welcomeCheerAmount?: number | null;
  quantity?: number | null;
  stripImageUrl?: string | null;
  bgColor?: string;
  fgColor?: string;
  labelColor?: string;
  reservationId?: string | null;
  reservationStatus?: string | null;
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
  productType,
  amount,
  welcomeCheerAmount,
  quantity,
  stripImageUrl,
  bgColor = "#0f172a",
  fgColor = "#ffffff",
  labelColor = "#94a3b8",
  reservationId,
  reservationStatus,
}: DigitalTicketProps) {
  const hasCustomDesign = !!(stripImageUrl || bgColor !== "#0f172a" || fgColor !== "#ffffff");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);

  const canCancel =
    status === "valid" &&
    paymentType === "A" &&
    !!reservationId &&
    reservationStatus === "reserved";

  const handleCancel = () => {
    setCancelError(null);
    startTransition(async () => {
      const res = await fetch(`/api/entrance/reservations/${reservationId}/cancel`, {
        method: "POST",
      });
      if (res.ok) {
        setShowConfirm(false);
        router.refresh();
      } else {
        const data = await res.json();
        setCancelError(data.error ?? "キャンセルに失敗しました");
        setShowConfirm(false);
      }
    });
  };

  const isVoucher = productType === "custom" && paymentType === "V";
  // ドリンクチケットはスキャンによる引換運用を持たない（決済完了画面自体が証跡）。
  // QRを見せてしまうと店頭スキャナに読み取られ誤って「使用済み」化しうるため、
  // マイチケット上でもQR・Apple Walletパスは一切生成・表示しない。
  const isDrinkTicket = productType === "custom" && paymentType === "D";

  useEffect(() => {
    if (!canvasRef.current || isDrinkTicket) return;
    // ブラウザ専用ライブラリを動的ロード
    import("qrcode").then(({ default: QRCode }) => {
      QRCode.toCanvas(canvasRef.current!, ticketCode, {
        width: 260,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      }).catch(console.error);
    });
  }, [ticketCode, isDrinkTicket]);

  const statusConfig = {
    valid: {
      label: "有効",
      color: "text-green-400",
      bg: "bg-green-500/10 border-green-500/30",
      icon: <CheckCircle size={12} className="text-green-400" />,
    },
    used: {
      label: isVoucher ? "引き換え済み" : "入場済み",
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

  const paymentTypeLabel: Record<string, string> = {
    A: "5日前確定",
    B: "即時確定",
    C: "当日決済",
  };

  const st = statusConfig[status];
  const isUsed = status === "used";

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border shadow-[0_0_60px_rgba(99,102,241,0.15)] ${
        isUsed ? "border-slate-700" : "border-indigo-500/30"
      }`}
      style={{ backgroundColor: isUsed ? undefined : bgColor }}
    >
      {/* カスタムデザインでない場合の背景グラデーション */}
      {!isUsed && !hasCustomDesign && (
        <>
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-indigo-500/5 -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-violet-600/5 translate-y-1/2 -translate-x-1/2 blur-3xl pointer-events-none" />
        </>
      )}
      {isUsed && <div className="absolute inset-0 bg-slate-800/60" />}

      {/* ストリップ画像 */}
      {stripImageUrl && (
        <div className="w-full overflow-hidden" style={{ aspectRatio: String(1125 / 294) }}>
          <img src={stripImageUrl} className="w-full h-full object-cover" alt="" />
        </div>
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
          <p className="text-[9px] font-black uppercase tracking-[0.35em]" style={{ color: labelColor }}>
            Digital Ticket
          </p>
          {!isDrinkTicket && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${st.bg}`}>
              {st.icon}
              <span className={st.color}>{st.label}</span>
            </div>
          )}
        </div>

        {/* イベント名・チケット種別 */}
        <div>
          <p className="text-xl font-black italic uppercase tracking-tighter leading-tight" style={{ color: fgColor }}>
            {eventTitle}
          </p>
          <p className="text-sm font-bold mt-1" style={{ color: labelColor }}>{productName}</p>
        </div>

        {/* イベント情報 */}
        <div className="space-y-1.5">
          {startAt && (
            <div className="flex items-center gap-2 text-xs" style={{ color: labelColor }}>
              <Calendar size={12} className="shrink-0" style={{ color: labelColor }} />
              {new Date(startAt).toLocaleString("ja-JP", {
                timeZone: DISPLAY_TZ,
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
            <div className="flex items-center gap-2 text-xs" style={{ color: labelColor }}>
              <MapPin size={12} className="shrink-0" style={{ color: labelColor }} />
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

        {/* QR コード（ドリンクチケットはスキャン運用が無いため表示しない） */}
        {!isDrinkTicket && (
          <div className="flex items-center justify-center py-2">
            <div className="p-3 rounded-2xl" style={{ background: "#ffffff" }}>
              <canvas ref={canvasRef} />
            </div>
          </div>
        )}

        {/* チケット下部情報 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900/60 rounded-2xl px-4 py-3 border border-slate-700/40">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Amount</p>
            {amount === 0 ? (
              <p className="text-lg font-black text-indigo-300 italic mt-0.5">Invitation</p>
            ) : (
              <>
                <p className="text-lg font-black text-white italic tabular-nums mt-0.5">
                  ¥{amount.toLocaleString()}
                </p>
                {!!welcomeCheerAmount && (
                  <p className="text-[9px] text-indigo-300 font-bold mt-0.5">
                    うちウェルカムチア ¥{welcomeCheerAmount.toLocaleString()}
                  </p>
                )}
                {paymentType === "C" && (
                  <p className="text-[9px] text-amber-400 font-bold mt-0.5">入場時決済</p>
                )}
              </>
            )}
          </div>
          <div className="bg-slate-900/60 rounded-2xl px-4 py-3 border border-slate-700/40">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{isDrinkTicket ? "Quantity" : "Plan"}</p>
            {isDrinkTicket ? (
              <p className="text-sm font-black text-indigo-300 mt-0.5">{quantity ?? 1}</p>
            ) : isVoucher ? (
              <p className="text-sm font-black text-indigo-300 mt-0.5">バウチャー</p>
            ) : paymentType && paymentTypeLabel[paymentType] ? (
              <>
                <p className="text-sm font-black text-indigo-300 mt-0.5">{paymentType}タイプ</p>
                <p className="text-[9px] text-slate-500">{paymentTypeLabel[paymentType]}</p>
              </>
            ) : (
              <p className="text-sm font-black text-indigo-300 mt-0.5">Invitation</p>
            )}
          </div>
        </div>

        {/* 入場済み / 引き換え済み情報 */}
        {checkedInAt && (
          <div className="flex items-center gap-2 bg-green-500/5 border border-green-500/15 rounded-xl px-4 py-2.5">
            <Clock size={12} className="text-green-400 shrink-0" />
            <p className="text-xs text-green-400 font-bold">
              {new Date(checkedInAt).toLocaleString("ja-JP", {
                timeZone: DISPLAY_TZ,
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })} に{isDrinkTicket ? "決済済み" : isVoucher ? "引き換え済み" : "入場済み"}
            </p>
          </div>
        )}

        {/* Apple Wallet（ドリンクチケットはスキャン運用が無いため対象外） */}
        {!isUsed && !isDrinkTicket && (
          <a
            href={`/api/wallet/ticket/${ticketId}`}
            className="flex items-center justify-center gap-2 w-full bg-black text-white text-sm font-bold rounded-2xl px-4 py-3 hover:bg-slate-800 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Apple Wallet に追加
          </a>
        )}

        {/* キャンセルボタン（Type A / 決済確定前のみ） */}
        {canCancel && (
          <div className="space-y-2">
            {cancelError && (
              <p className="text-xs text-red-400 font-bold text-center">{cancelError}</p>
            )}
            {showConfirm ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 space-y-3">
                <p className="text-xs text-red-300 font-bold text-center">
                  本当にキャンセルしますか？<br />
                  <span className="text-slate-400 font-normal">イベント5日前以降はキャンセルできません。</span>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    className="flex-1 h-10 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    戻る
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={isPending}
                    className="flex-1 h-10 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1"
                  >
                    {isPending ? <Loader2 size={14} className="animate-spin" /> : "キャンセルする"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="w-full h-10 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-bold rounded-2xl transition-colors"
              >
                予約をキャンセル
              </button>
            )}
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
