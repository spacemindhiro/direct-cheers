import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  cacheComponents: true,
  // タッチ決済アプリ実機検証用: Pixel等のLAN内端末からdevサーバーの
  // dev用アセット(_next/webpack-hmr等)へのクロスオリジンアクセスを許可する。
  // 開発モード限定の設定のため本番ビルドには影響しない。
  allowedDevOrigins: ["192.168.1.10"],
};

export default withNextIntl(nextConfig);
