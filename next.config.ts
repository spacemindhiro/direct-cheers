import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// hotfix/* などの個別Previewでは、メール・QR等のリンク先をそのPreview自身にする。
// Preview共通の NEXT_PUBLIC_SITE_URL はSTGを指しているため、そのままだとリンクを踏んだ先が
// developのコードになり、本番反映前の通し検証ができない（2026-10-12 検証フロー変更）。
// NEXT_PUBLIC_ はビルド時にインライン化されるので、ビルド開始時点のここで差し替えれば全参照箇所に効く。
// 本番（VERCEL_ENV=production）とSTG（developブランチ）は対象外で、従来どおり。
if (
  process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF !== "develop" &&
  process.env.VERCEL_BRANCH_URL
) {
  process.env.NEXT_PUBLIC_SITE_URL = `https://${process.env.VERCEL_BRANCH_URL}`;
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  // タッチ決済アプリ実機検証用: Pixel等のLAN内端末からdevサーバーの
  // dev用アセット(_next/webpack-hmr等)へのクロスオリジンアクセスを許可する。
  // 開発モード限定の設定のため本番ビルドには影響しない。
  allowedDevOrigins: ["192.168.1.10"],
};

export default withNextIntl(nextConfig);
