"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImageCropperModal } from "@/components/image-cropper-modal";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  currentUrl?: string | null;
  pathPrefix?: string;
  eventTitle?: string;
  artistName?: string;
  onUploadComplete: (url: string | null) => void;
};

/**
 * 3:2 クロップ済み blob に Wallet 用オーバーレイを合成して返す。
 * - 上部 28%: 暗いグラデーション
 * - イベント名 / アーティスト名を白抜き文字でオーバーレイ
 * - "Direct Cheers" ウォーターマーク（右上）
 */
async function generateWalletImage(
  blob: Blob,
  eventTitle: string,
  artistName: string,
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });

  const W = 1200, H = 800;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // 元画像
  ctx.drawImage(image, 0, 0, W, H);

  // 上部グラデーション
  const overlayH = H * 0.32;
  const grad = ctx.createLinearGradient(0, 0, 0, overlayH);
  grad.addColorStop(0, "rgba(0,0,0,0.80)");
  grad.addColorStop(1, "rgba(0,0,0,0.00)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, overlayH);

  // 右下グラデーション（ブランドカラー補助）
  const bottomGrad = ctx.createLinearGradient(W, H, W * 0.5, H * 0.7);
  bottomGrad.addColorStop(0, "rgba(236,72,153,0.25)");
  bottomGrad.addColorStop(1, "rgba(236,72,153,0.00)");
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "top";

  // "Direct Cheers" ウォーターマーク（右上）
  ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.textAlign = "right";
  ctx.fillText("Direct Cheers", W - 44, 36);

  // イベント名
  if (eventTitle) {
    ctx.font = "600 26px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.80)";
    ctx.textAlign = "left";
    // 長い場合はトリミング
    let title = eventTitle;
    while (ctx.measureText(title).width > W - 180 && title.length > 4) {
      title = title.slice(0, -1);
    }
    if (title !== eventTitle) title += "…";
    ctx.fillText(title, 44, 38);
  }

  // アーティスト名（大きく）
  if (artistName) {
    ctx.font = "900 58px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.97)";
    ctx.textAlign = "left";
    let name = artistName;
    while (ctx.measureText(name).width > W - 88 && name.length > 4) {
      name = name.slice(0, -1);
    }
    if (name !== artistName) name += "…";
    ctx.fillText(name, 44, 80);
  }

  URL.revokeObjectURL(image.src);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("wallet image failed"))),
      "image/jpeg",
      0.90,
    ),
  );
}

export function QRImageUpload({ currentUrl, pathPrefix, eventTitle = "", artistName = "", onUploadComplete }: Props) {
  const [rawSrc, setRawSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [displayUrl, setDisplayUrl] = useState<string | null>(currentUrl ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setRawSrc(reader.result as string); setCropOpen(true); };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropComplete = async (blob: Blob) => {
    setCropOpen(false);
    // rawSrc は保持（再クロップ用）
    setUploading(true);
    try {
      // Wallet合成画像を生成（eventTitle / artistName があれば）
      const finalBlob =
        eventTitle || artistName
          ? await generateWalletImage(blob, eventTitle, artistName)
          : blob;

      const supabase = createClient();
      const prefix = pathPrefix ?? crypto.randomUUID();
      const path = `${prefix}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("qr-images")
        .upload(path, finalBlob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("qr-images").getPublicUrl(path);
      setDisplayUrl(data.publicUrl);
      onUploadComplete(data.publicUrl);
    } catch (err) {
      toast.error("画像のアップロードに失敗しました。もう一度お試しください。");
      console.error("[qr-image-upload]", err);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => { setDisplayUrl(null); setRawSrc(null); onUploadComplete(null); };
  const handleAreaClick = () => { rawSrc ? setCropOpen(true) : fileRef.current?.click(); };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
        QR 画像（任意）
      </label>

      <div
        onClick={handleAreaClick}
        className="relative w-full max-w-[270px] rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 cursor-pointer hover:border-pink-500/40 transition-colors flex items-center justify-center select-none group"
        style={{ aspectRatio: "3/2" }}
      >
        {uploading ? (
          <Loader2 size={24} className="text-pink-500 animate-spin" />
        ) : displayUrl ? (
          <>
            <img src={displayUrl} className="w-full h-full object-cover" alt="QR image" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
              <Camera size={20} className="text-white" />
              <p className="text-[10px] font-black text-white uppercase tracking-widest">
                {rawSrc ? '再クロップ' : '変更'}
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-600 pointer-events-none">
            <Camera size={22} />
            <p className="text-[10px] font-bold">タップして追加 (3:2)</p>
          </div>
        )}
      </div>

      {displayUrl && (
        <div className="flex items-center gap-4">
          {rawSrc && (
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors font-bold">
              <Camera size={10} /> 別の画像
            </button>
          )}
          <button type="button" onClick={handleRemove}
            className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-red-400 transition-colors font-bold">
            <X size={10} /> 画像を削除
          </button>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

      {cropOpen && rawSrc && (
        <ImageCropperModal
          imageSrc={rawSrc}
          onComplete={handleCropComplete}
          onCancel={() => { setCropOpen(false); setRawSrc(null); }}
        />
      )}
    </div>
  );
}
