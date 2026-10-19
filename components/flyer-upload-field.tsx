"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { downscaleImage } from "@/lib/image-downscale";

/**
 * イベントのフライヤー（任意）。切り抜かずに元の比率のまま保存し、
 * QR画像・チケット画像を作るときに「フライヤーを使う」で素材として選べるようにする。
 * 値（URL）は親フォームが保存時に base_flyer_url として送る。
 */
export function FlyerUploadField({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", await downscaleImage(file), "flyer.jpg");
      const res = await fetch("/api/events/flyer/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "upload failed");
      onChange(data.url);
    } catch (err) {
      toast.error("フライヤーのアップロードに失敗しました。もう一度お試しください。");
      console.error("[flyer-upload]", err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
        <ImageIcon size={11} className="text-pink-500" /> フライヤー（任意）
      </label>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="relative w-24 h-32 shrink-0 rounded-2xl overflow-hidden border border-dashed border-slate-700 bg-slate-950/50 hover:border-pink-500/50 transition-colors flex items-center justify-center"
        >
          {uploading ? (
            <Loader2 size={20} className="animate-spin text-pink-500" />
          ) : value ? (
            <img src={value} alt="フライヤー" className="w-full h-full object-contain bg-black" />
          ) : (
            <ImageIcon size={20} className="text-slate-600" />
          )}
        </button>
        <div className="space-y-2 pt-1">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            QR画像やチケット画像を作るときに、このフライヤーを素材として選べます。
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-[11px] font-bold text-pink-400 hover:text-pink-300"
          >
            {value ? "フライヤーを変更" : "フライヤーを選択"}
          </button>
          {value && !uploading && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-red-400 transition-colors font-bold"
            >
              <X size={10} /> フライヤーを外す
            </button>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleSelect} className="hidden" />
    </div>
  );
}
