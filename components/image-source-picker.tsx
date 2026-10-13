"use client";

import { useState } from "react";
import { ImageIcon, Loader2, Upload, UserRound } from "lucide-react";
import { toast } from "sonner";

export type ImageSourceOptions = {
  // 宛先の画像（名義の画像→基本の画像）。originalUrl が無ければ 400px 版から切り抜く
  recipient?: { url: string; originalUrl: string | null; name: string } | null;
  // イベントのフライヤー（events.base_flyer_url）
  flyerUrl?: string | null;
};

/**
 * QR画像・チケット画像の素材を「宛先の画像／フライヤー／その場でアップロード」から選ぶボタン群。
 * 宛先の画像・フライヤーは取得して object URL にしてから渡す
 * （Storage の URL を直接 canvas に描くと、切り抜き結果を書き出すときに汚染扱いで失敗するため）。
 */
export function ImageSourcePicker({
  sources,
  onPicked,
  onUploadClick,
  disabled,
}: {
  sources?: ImageSourceOptions;
  onPicked: (src: string) => void;
  onUploadClick: () => void;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState<"recipient" | "flyer" | null>(null);
  const [pickedLowRes, setPickedLowRes] = useState(false);
  const recipient = sources?.recipient ?? null;
  const flyerUrl = sources?.flyerUrl ?? null;

  const pick = async (kind: "recipient" | "flyer", url: string) => {
    setLoading(kind);
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onPicked(URL.createObjectURL(await res.blob()));
      setPickedLowRes(kind === "recipient" && !recipient?.originalUrl);
    } catch (err) {
      toast.error("画像を読み込めませんでした。もう一度お試しください。");
      console.error("[image-source-picker]", err);
    } finally {
      setLoading(null);
    }
  };

  const base = "flex-1 min-w-0 h-auto min-h-[3.5rem] px-2 py-2 rounded-xl border text-[10px] font-bold flex flex-col items-center justify-center gap-1 transition-colors";
  const enabledCls = "bg-slate-800 border-slate-700 text-slate-300 hover:border-pink-500/50";
  const disabledCls = "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed";

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || !recipient || loading !== null}
          onClick={() => recipient && pick("recipient", recipient.originalUrl ?? recipient.url)}
          className={`${base} ${recipient ? enabledCls : disabledCls}`}
        >
          {loading === "recipient" ? <Loader2 size={14} className="animate-spin" /> : <UserRound size={14} />}
          <span>宛先の画像</span>
          <span className="text-[9px] font-normal text-slate-500 truncate max-w-full">{recipient ? recipient.name : "未登録"}</span>
        </button>
        <button
          type="button"
          disabled={disabled || !flyerUrl || loading !== null}
          onClick={() => flyerUrl && pick("flyer", flyerUrl)}
          className={`${base} ${flyerUrl ? enabledCls : disabledCls}`}
        >
          {loading === "flyer" ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
          <span>フライヤー</span>
          <span className="text-[9px] font-normal text-slate-500 truncate max-w-full">{flyerUrl ? "イベントの画像" : "未登録"}</span>
        </button>
        <button
          type="button"
          disabled={disabled || loading !== null}
          onClick={() => { setPickedLowRes(false); onUploadClick(); }}
          className={`${base} ${enabledCls}`}
        >
          <Upload size={14} />
          <span>アップロード</span>
          <span className="text-[9px] font-normal text-slate-500">端末の画像</span>
        </button>
      </div>
      {!flyerUrl && (
        <p className="text-[9px] text-slate-600">フライヤーはイベントの編集画面で登録できます。</p>
      )}
      {pickedLowRes && (
        <p className="text-[9px] text-amber-400/80">
          宛先の画像は小さいサイズ（400px）しか無いため、粗く見える場合があります。宛先の方がプロフィールで画像を登録し直すと高画質になります。
        </p>
      )}
    </div>
  );
}
