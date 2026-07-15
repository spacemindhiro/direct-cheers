import type { CapacitorConfig } from "@capacitor/cli";

// タッチ決済（Case④）専用のCapacitorラッパー設定。
// 中身はVercel上の既存Next.jsアプリをそのままWebViewで読み込む。
// Bluetoothカードリーダー（WisePad 3等）と接続するネイティブ機能だけを
// @capgo/capacitor-stripe-terminal 経由で追加する。
// このconfigに対応する `android/` ネイティブプロジェクトの生成（`npx cap add android`）・
// ビルド・署名・実機インストールは対象外（別途Android Studio環境で行う）。
const config: CapacitorConfig = {
  appId: "com.directcheers.touchpay",
  appName: "Direct Cheers タッチ決済",
  webDir: "public",
  server: {
    // 本番のNext.jsアプリをそのままWebViewで開く（静的バンドルは持たない）
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com",
    cleartext: false,
  },
};

export default config;
