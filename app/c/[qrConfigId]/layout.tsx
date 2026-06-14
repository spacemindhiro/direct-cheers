import type { Metadata } from "next";
import { headers } from "next/headers";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://direct-cheers.com";

export async function generateMetadata(
  { params }: { params: Promise<{ qrConfigId: string }> }
): Promise<Metadata> {
  const { qrConfigId } = await params;
  // 相対URLだとNext.jsがVercel Preview環境でcrossorigin="use-credentials"を付与し、
  // iOSのmanifest取得がCORSエラーで失敗してstandalone判定が外れるため絶対URLにする。
  // NEXT_PUBLIC_SITE_URL固定値（本番ドメイン）だと、stg等の別オリジンで開いた場合に
  // manifestのscope/start_urlが本番オリジンに解決されドキュメントと一致せず、
  // iOSが「スコープ外」と判定しブラウザUIを強制表示するため、常にリクエスト自身の
  // オリジン（hostヘッダー）で絶対URLを組み立てる。
  const h = await headers();
  const host = h.get("host") ?? new URL(siteUrl).host;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;
  return { manifest: `${origin}/api/manifest/qr/${qrConfigId}` };
}

export default function QrLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
