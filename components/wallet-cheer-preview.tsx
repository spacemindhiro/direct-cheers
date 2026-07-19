"use client";

type Props = {
  eventTitle?: string;
  recipientName?: string;
  imageUrl?: string | null;
  amount?: number;
};

export function WalletCheerPreview({
  eventTitle = "イベント名",
  recipientName = "Artist",
  imageUrl,
  amount = 0,
}: Props) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
        Wallet プレビュー
      </p>

      <div className="relative w-full max-w-[280px] mx-auto rounded-[20px] overflow-hidden shadow-[0_12px_48px_rgba(0,0,0,0.7)] bg-[#020617]">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-pink-500 flex items-center justify-center shrink-0">
              <span className="text-white text-[7px] font-black leading-none">DC</span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              direct cheers
            </span>
          </div>
          <span className="text-[9px] font-bold text-slate-400">Cheers</span>
        </div>

        {/* ストリップ画像 */}
        <div className="w-full overflow-hidden" style={{ aspectRatio: "3 / 2" }}>
          {imageUrl ? (
            <img src={imageUrl} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/5">
              <span className="text-[9px] font-bold text-slate-400">Strip Image</span>
            </div>
          )}
        </div>

        {/* logoText相当：受取アーティスト名 */}
        <div className="px-4 pt-3">
          <p className="text-sm font-black text-white truncate">{recipientName}</p>
        </div>

        {/* secondaryFields: EVENT / CHEERS */}
        <div className="grid grid-cols-2 gap-2 px-4 pt-2.5">
          <div>
            <p className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-400">Event</p>
            <p className="text-[9px] font-bold mt-0.5 text-white truncate">{eventTitle}</p>
          </div>
          <div>
            <p className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-400">Cheers</p>
            <p className="text-[9px] font-bold mt-0.5 text-white">¥{amount.toLocaleString()}</p>
          </div>
        </div>

        {/* auxiliaryFields: No. / DATE */}
        <div className="grid grid-cols-2 gap-2 px-4 pt-2 pb-4">
          <div>
            <p className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-400">No.</p>
            <p className="text-[9px] font-bold mt-0.5 text-slate-300">#001</p>
          </div>
          <div>
            <p className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-400">Date</p>
            <p className="text-[9px] font-bold mt-0.5 text-slate-300">
              {new Date().toLocaleDateString("ja-JP")}
            </p>
          </div>
        </div>
      </div>

      <p className="text-[9px] text-slate-600 text-center">
        ※ 実際のWalletパスとは若干異なります
      </p>
    </div>
  );
}
