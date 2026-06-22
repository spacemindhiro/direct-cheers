'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ImageCropperModal } from '@/components/image-cropper-modal';

type Props = {
  value: string;
  onChange: (url: string) => void;
  placeholderLabel?: string;
};

/**
 * クロップ→/api/avatar/upload へのアップロード→URL確定までを内包したアバター入力欄。
 * 同一プロフィールに複数のアバター（基本/主催者用/演者用）を持たせる際、
 * クロップ中の状態（cropSrc等）が衝突しないよう、フィールドごとに状態を完全に分離する。
 */
export function AvatarUploadField({ value, onChange, placeholderLabel = '画像を選択' }: Props) {
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setShowCropper(true);
    e.target.value = '';
  };

  const handleClick = () => {
    if (cropSrc) setShowCropper(true);
    else fileRef.current?.click();
  };

  const handleCropComplete = async (blob: Blob) => {
    setShowCropper(false);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', blob, 'avatar.jpg');
      const res = await fetch('/api/avatar/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.url) onChange(data.url);
      else toast.error('アップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {showCropper && cropSrc && (
        <ImageCropperModal
          imageSrc={cropSrc}
          aspect={1}
          outputWidth={400}
          outputHeight={400}
          label="1:1"
          onComplete={handleCropComplete}
          onCancel={() => setShowCropper(false)}
        />
      )}
      <div className="flex items-center gap-3">
        <div
          onClick={handleClick}
          className="relative w-14 h-14 rounded-2xl overflow-hidden border border-slate-700 shrink-0 cursor-pointer group"
        >
          {value ? (
            <img src={value} alt="avatar" className="w-full h-full object-cover"
              onError={(e) => (e.currentTarget.style.display = 'none')} />
          ) : (
            <div className="w-full h-full bg-slate-800 flex items-center justify-center">
              <Camera size={20} className="text-slate-600" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera size={16} className="text-white" />
          </div>
        </div>
        <label className="flex-1 h-14 bg-slate-950/50 border border-dashed border-slate-700 rounded-2xl px-5 flex items-center gap-2 text-sm cursor-pointer hover:border-pink-500/50 transition-all">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleSelect} disabled={uploading} />
          {uploading
            ? <><Loader2 size={16} className="animate-spin text-pink-500" /><span className="text-slate-400">アップロード中...</span></>
            : <><Camera size={16} className="text-slate-500" /><span className="text-slate-500">{placeholderLabel}</span></>
          }
        </label>
      </div>
      {cropSrc && value && (
        <p className="text-[10px] text-slate-600 mt-1">↑ 画像をタップすると再クロップできます</p>
      )}
    </>
  );
}
