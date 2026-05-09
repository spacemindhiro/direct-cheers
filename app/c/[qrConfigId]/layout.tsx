import type { Metadata } from "next";

export async function generateMetadata(
  { params }: { params: Promise<{ qrConfigId: string }> }
): Promise<Metadata> {
  const { qrConfigId } = await params;
  return { manifest: `/api/manifest/qr/${qrConfigId}` };
}

export default function QrLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
