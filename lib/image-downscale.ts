"use client";

/**
 * ブラウザ上で画像を長辺 maxSide 以下に縮小して JPEG にする（拡大はしない）。
 * スマホの写真をそのまま送ると Vercel のリクエスト上限（4.5MB）を超えるため、送る前に縮める。
 * <img> 経由で描くので、EXIF の向き（縦撮り写真の回転）はブラウザが補正した状態で描かれる。
 */
export async function downscaleImage(src: Blob, maxSide = 1600): Promise<Blob> {
  const objectUrl = URL.createObjectURL(src);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = objectUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const w = Math.round(image.naturalWidth * scale);
    const h = Math.round(image.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(image, 0, 0, w, h);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("downscale failed"))), "image/jpeg", 0.9),
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
