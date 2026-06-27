"use client";

import { useRouter } from "next/navigation";
import { QRImageUpload } from "@/components/qr-image-upload";
import { toast } from "sonner";

export function QRRecipientImageEdit({
  qrConfigId,
  currentImageUrl,
  eventTitle,
  artistName,
}: {
  qrConfigId: string;
  currentImageUrl: string | null;
  eventTitle: string;
  artistName: string;
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
      onUploadComplete={handleUploadComplete}
    />
  );
}
