"use client";

import { useRouter } from "next/navigation";
import { QRImageUpload } from "@/components/qr-image-upload";
import type { ImageSourceOptions } from "@/components/image-source-picker";
import { toast } from "sonner";

export function QRRecipientImageEdit({
  qrConfigId,
  currentImageUrl,
  eventTitle,
  artistName,
  sources,
}: {
  qrConfigId: string;
  currentImageUrl: string | null;
  eventTitle: string;
  artistName: string;
  sources?: ImageSourceOptions;
}) {
  const router = useRouter();

  const handleUploadComplete = async (url: string | null) => {
    const res = await fetch(`/api/qr/${qrConfigId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: url }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "画像の保存に失敗しました");
      return;
    }
    router.refresh();
  };

  return (
    <QRImageUpload
      currentUrl={currentImageUrl}
      pathPrefix={qrConfigId}
      eventTitle={eventTitle}
      artistName={artistName}
      sources={sources}
      onUploadComplete={handleUploadComplete}
    />
  );
}
