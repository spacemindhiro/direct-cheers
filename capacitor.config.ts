import type { CapacitorConfig } from "@capacitor/cli";

// タッチ決済（Case④）専用のCapacitorラッパー設定。
// 中身はVercel上の既存Next.jsアプリをそのままWebViewで読み込む。
// Bluetoothカードリーダー（WisePad 3等）と接続するネイティブ機能だけを
// @capgo/capacitor-stripe-terminal 経由で追加する。
// このconfigに対応する `android/` ネイティブプロジェクトの生成（`npx cap add android`）・
// ビルド・署名・実機インストールは対象外（別途Android Studio環境で行う）。
// 実機テスト時はローカル開発サーバーへ向けられる:
//   NEXT_PUBLIC_SITE_URL=http://<MacのLAN IP>:3000 npx cap sync android
const serverUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://direct-cheers.com";

const config: CapacitorConfig = {
  appId: "com.directcheers.touchpay",
  appName: "Direct Cheers タッチ決済",
  webDir: "public",
  server: {
    // 本番のNext.jsアプリをそのままWebViewで開く（静的バンドルは持たない）。
    // 起動ページはdashboard: スタッフ端末にトップページ（マーケ画面）は不要で、
    // WebView復帰時に起動URLへ戻った際「未ログインに見える」誤解も防ぐ
    // （未ログインなら/auth/loginへリダイレクトされるだけで安全）。
    url: `${serverUrl}/dashboard`,
    cleartext: serverUrl.startsWith("http://"),
  },
  plugins: {
    SystemBars: {
      // インセット処理はMainActivity側で行う（サイトがviewport-fit=cover宣言のみで
      // safe-area CSS対応を持たないため、標準のパススルーだとヘッダがステータスバーと重なる）
      insetsHandling: "disable",
      // サイトはダーク基調のためシステムバーのアイコンを白にする
      style: "DARK",
    },
  },
};

export default config;
