"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImageCropperModal } from "@/components/image-cropper-modal";
import { Camera, Loader2, X } from "lucide-react";

type Props = {
  currentUrl?: string | null;
  pathPrefix?: string; // storage path prefix (e.g. qrConfigId or UUID)
  onUploadComplete: (url: string | null) => void;
};

export function QRImageUpload({ currentUrl, pathPrefix, onUploadComplete }: Props) {
  const [rawSrc, setRawSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [displayUrl, setDisplayUrl] = useState<string | null>(currentUrl ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRawSrc(reader.result as string);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropComplete = async (blob: Blob) => {
    setCropOpen(false);
    setRawSrc(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const prefix = pathPrefix ?? crypto.randomUUID();
      const path = `${prefix}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("qr-images")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("qr-images").getPublicUrl(path);
      setDisplayUrl(data.publicUrl);
      onUploadComplete(data.publicUrl);
    } catch {
      // アップロード失敗は黙って無視（再試行可）
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setDisplayUrl(null);
    onUploadComplete(null);
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
        QR 画像（任意）
      </label>

      <div
        onClick={() => fileRef.current?.click()}
        className="relative w-full aspect-square max-w-[180px] rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 cursor-pointer hover:border-pink-500/40 transition-colors flex items-center justify-center select-none"
      >
        {uploading ? (
          <Loader2 size={24} className="text-pink-500 animate-spin" />
        ) : displayUrl ? (
          <>
            <img src={displayUrl} className="w-full h-full object-cover" alt="QR image" />
            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
              <Camera size={20} className="text-white" />
              <p className="text-[10px] font-black text-white uppercase tracking-widest">変更</p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-600 pointer-events-none">
            <Camera size={22} />
            <p className="text-[10px] font-bold">タップして追加</p>
          </div>
        )}
      </div>

      {displayUrl && (
        <button
          type="button"
          onClick={handleRemove}
          className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-red-400 transition-colors font-bold"
        >
          <X size={10} /> 画像を削除
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

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
