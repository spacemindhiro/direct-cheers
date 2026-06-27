"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { X, Check, Loader2, ZoomIn } from "lucide-react";

type Props = {
  imageSrc: string;
  onComplete: (blob: Blob) => void;
  onCancel: () => void;
  aspect?: number;
  outputWidth?: number;
  outputHeight?: number;
  label?: string;
};

export async function getCroppedImg(
  src: string,
  crop: Area,
  outputWidth = 1200,
  outputHeight = 800,
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outputWidth, outputHeight);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("crop failed"))),
      "image/jpeg",
      0.88,
    ),
  );
}

export function ImageCropperModal({
  imageSrc,
  onComplete,
  onCancel,
  aspect = 3 / 2,
  outputWidth = 1200,
  outputHeight = 800,
  label,
}: Props) {
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
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels, outputWidth, outputHeight);
      onComplete(blob);
    } finally {
      setProcessing(false);
    }
  };

  const aspectLabel = label ?? (aspect === 1 ? "1:1" : "3:2");
  // クロップエリアは横長すぎるとモバイルで使いにくいため高さを制限
  const cropContainerStyle = aspect > 2
    ? { height: "140px" }
    : { aspectRatio: String(aspect) };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <p className="text-sm font-black text-white">画像をトリミング <span className="text-slate-500 text-xs font-normal">{aspectLabel}</span></p>
          <button type="button" onClick={onCancel} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* クロップエリア */}
        <div className="relative bg-black" style={cropContainerStyle}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <ZoomIn size={14} className="text-slate-500 shrink-0" />
            <input
              type="range" min={1} max={3} step={0.01} value={zoom}
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
            {processing ? <Loader2 size={16} className="animate-spin" /> : <><Check size={16} /> 決定</>}
          </button>
        </div>
      </div>
    </div>
  );
}
