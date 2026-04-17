"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { X, Check, Loader2, ZoomIn } from "lucide-react";

type Props = {
  imageSrc: string;
  onComplete: (blob: Blob) => void;
  onCancel: () => void;
};

async function getCroppedImg(src: string, crop: Area, maxSize = 1024): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  const size = Math.min(maxSize, crop.width, crop.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, size, size);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("crop failed"))),
      "image/jpeg",
      0.85,
    ),
  );
}

export function ImageCropperModal({ imageSrc, onComplete, onCancel }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onComplete(blob);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <p className="text-sm font-black text-white">画像をトリミング</p>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-500 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* クロップエリア */}
        <div className="relative h-72 bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* ズームスライダー */}
          <div className="flex items-center gap-3">
            <ZoomIn size={14} className="text-slate-500 shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-pink-500"
            />
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={processing}
            className="w-full h-12 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-60"
          >
            {processing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <><Check size={16} /> 決定</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
