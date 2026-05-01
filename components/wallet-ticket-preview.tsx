"use client";

type Props = {
  eventTitle?: string;
  productName?: string;
  startAt?: string | null;
  venue?: string | null;
  stripImageUrl?: string | null;
  bgColor?: string;
  fgColor?: string;
  labelColor?: string;
};

const STRIP_ASPECT = 1125 / 294;

export function WalletTicketPreview({
  eventTitle = "イベント名",
  productName = "チケット",
  startAt,
  venue,
  stripImageUrl,
  bgColor = "#0f172a",
  fgColor = "#ffffff",
  labelColor = "#94a3b8",
}: Props) {
  const fmtDate = startAt
    ? new Date(startAt).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
        Wallet プレビュー
      </p>

      <div
        className="relative w-full max-w-[280px] mx-auto rounded-[20px] overflow-hidden shadow-[0_12px_48px_rgba(0,0,0,0.7)]"
        style={{ backgroundColor: bgColor }}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-pink-500 flex items-center justify-center shrink-0">
              <span className="text-white text-[7px] font-black leading-none">DC</span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: labelColor }}>
              direct cheers
            </span>
          </div>
          <span className="text-[9px] font-bold" style={{ color: labelColor }}>Ticket</span>
        </div>

        {/* ストリップ画像 */}
        <div className="w-full overflow-hidden" style={{ aspectRatio: String(STRIP_ASPECT) }}>
          {stripImageUrl ? (
            <img src={stripImageUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: `${fgColor}08` }}
            >
              <span className="text-[9px] font-bold" style={{ color: labelColor }}>
                Strip Image
              </span>
            </div>
          )}
        </div>

        {/* イベント情報 */}
        <div className="px-4 pt-3 pb-2 space-y-2.5">
          <div>
            <p className="text-[7px] font-black uppercase tracking-[0.2em]" style={{ color: labelColor }}>
              Event
            </p>
            <p
              className="text-xs font-black leading-tight mt-0.5 line-clamp-2"
              style={{ color: fgColor }}
            >
              {eventTitle}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {fmtDate && (
              <div>
                <p className="text-[7px] font-black uppercase tracking-[0.2em]" style={{ color: labelColor }}>Date</p>
                <p className="text-[9px] font-bold mt-0.5" style={{ color: fgColor }}>{fmtDate}</p>
              </div>
            )}
            {venue && (
              <div>
                <p className="text-[7px] font-black uppercase tracking-[0.2em]" style={{ color: labelColor }}>Venue</p>
                <p className="text-[9px] font-bold mt-0.5 truncate" style={{ color: fgColor }}>{venue}</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-[7px] font-black uppercase tracking-[0.2em]" style={{ color: labelColor }}>Ticket</p>
            <p className="text-[9px] font-bold mt-0.5" style={{ color: fgColor }}>{productName}</p>
          </div>
        </div>

        {/* QRコード（プレースホルダー） */}
        <div className="flex justify-center py-3">
          <div
            className="w-16 h-16 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${fgColor}12`, border: `1px solid ${fgColor}20` }}
          >
            {/* 固定パターン（hydrationエラー防止） */}
            <svg width="40" height="40" viewBox="0 0 40 40" style={{ opacity: 0.3 }}>
              <rect x="0" y="0" width="16" height="16" fill={fgColor} />
              <rect x="2" y="2" width="12" height="12" fill={bgColor} />
              <rect x="4" y="4" width="8" height="8" fill={fgColor} />
              <rect x="24" y="0" width="16" height="16" fill={fgColor} />
              <rect x="26" y="2" width="12" height="12" fill={bgColor} />
              <rect x="28" y="4" width="8" height="8" fill={fgColor} />
              <rect x="0" y="24" width="16" height="16" fill={fgColor} />
              <rect x="2" y="26" width="12" height="12" fill={bgColor} />
              <rect x="4" y="28" width="8" height="8" fill={fgColor} />
              <rect x="20" y="18" width="4" height="4" fill={fgColor} />
              <rect x="26" y="18" width="4" height="4" fill={fgColor} />
              <rect x="18" y="24" width="4" height="4" fill={fgColor} />
              <rect x="24" y="24" width="4" height="4" fill={fgColor} />
              <rect x="30" y="24" width="4" height="4" fill={fgColor} />
              <rect x="20" y="30" width="4" height="4" fill={fgColor} />
              <rect x="28" y="30" width="4" height="4" fill={fgColor} />
            </svg>
          </div>
        </div>
      </div>

      <p className="text-[9px] text-slate-600 text-center">
        ※ 実際のWalletパスとは若干異なります
      </p>
    </div>
  );
}
