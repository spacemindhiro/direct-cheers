"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImageCropperModal } from "@/components/image-cropper-modal";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  currentUrl?: string | null;
  pathPrefix?: string;
  onUploadComplete: (url: string | null) => void;
};

const STRIP_ASPECT = 1125 / 294;

export function StripImageUpload({ currentUrl, pathPrefix, onUploadComplete }: Props) {
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
    setUploading(true);
    try {
      const supabase = createClient();
      const prefix = pathPrefix ?? crypto.randomUUID();
      const path = `${prefix}/strip-${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("qr-images")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("qr-images").getPublicUrl(path);
      setDisplayUrl(data.publicUrl);
      onUploadComplete(data.publicUrl);
    } catch (err) {
      toast.error("画像のアップロードに失敗しました。");
      console.error("[strip-image-upload]", err);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => { setDisplayUrl(null); setRawSrc(null); onUploadComplete(null); };
  const handleAreaClick = () => { rawSrc ? setCropOpen(true) : fileRef.current?.click(); };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
        ストリップ画像（任意）
        <span className="text-slate-600 font-normal normal-case tracking-normal ml-2">1125 × 294 / 約4:1</span>
      </label>

      <div
        onClick={handleAreaClick}
        className="relative w-full rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 cursor-pointer hover:border-indigo-500/40 transition-colors flex items-center justify-center select-none group"
        style={{ aspectRatio: String(STRIP_ASPECT) }}
      >
        {uploading ? (
          <Loader2 size={24} className="text-indigo-500 animate-spin" />
        ) : displayUrl ? (
          <>
            <img src={displayUrl} className="w-full h-full object-cover" alt="Strip image" />
            {/* セーフティエリア表示 */}
            <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent pointer-events-none">
              <p className="absolute bottom-1 left-2 text-[7px] text-white/40 font-bold uppercase tracking-widest">text area</p>
            </div>
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
              <Camera size={20} className="text-white" />
              <p className="text-[10px] font-black text-white uppercase tracking-widest">
                {rawSrc ? "再クロップ" : "変更"}
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-600 pointer-events-none">
            <Camera size={22} />
            <p className="text-[10px] font-bold">タップして追加</p>
            <p className="text-[9px] text-slate-700">横長の写真を推奨</p>
          </div>
        )}
      </div>

      {displayUrl && (
        <button type="button" onClick={handleRemove}
          className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-red-400 transition-colors font-bold">
          <X size={10} /> 画像を削除
        </button>
      )}

      <p className="text-[9px] text-slate-600">
        Apple Walletのストリップ画像。下部にテキストが重なるため重要な要素は中央上部に配置してください。
      </p>

      <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

      {cropOpen && rawSrc && (
        <ImageCropperModal
          imageSrc={rawSrc}
          aspect={STRIP_ASPECT}
          outputWidth={1125}
          outputHeight={294}
          label="4:1 (Strip)"
          onComplete={handleCropComplete}
          onCancel={() => setCropOpen(false)}
        />
      )}
    </div>
  );
}
