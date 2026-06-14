import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://direct-cheers.com";

export async function generateMetadata(
  { params }: { params: Promise<{ qrConfigId: string }> }
): Promise<Metadata> {
  const { qrConfigId } = await params;
  // 相対URLだとNext.jsがVercel Preview環境でcrossorigin="use-credentials"を付与し、
  // iOSのmanifest取得がCORSエラーで失敗してstandalone判定が外れるため絶対URLにする
  return { manifest: `${siteUrl}/api/manifest/qr/${qrConfigId}` };
}

export default function QrLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
