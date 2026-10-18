"use client";

import { useEffect } from "react";

// 子機は電池が切れるまでQRを表示し続ける用途のため、OSの画面タイムアウト設定
// （Androidは最大30分）に依存せず Wake Lock API で画面消灯を防ぐ。
//
// QR画面のコンポーネント内だけで取得していた頃は、ログイン切れの自動リロード後の
// 「ログインが必要です」画面・エラー画面・読み込み中表示では保持されず、
// 運用中に一度でもそれらへ切り替わると30分後に消灯していた。
// そのためページの一番外側（layout）に置き、表示内容に関係なく保持する。
//
// Wake Lock はタブ非表示時のほか、ブラウザ側の判断でも解放されうる。
// 解放イベント・表示復帰時に取り直し、取れていなければ定期的に再試行する。
const RETRY_INTERVAL_MS = 60_000;

export function ScreenWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let requesting = false;
    let disposed = false;

    const request = async () => {
      if (disposed || requesting) return;
      if (sentinel && !sentinel.released) return;
      if (document.visibilityState !== "visible") return;
      requesting = true;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (disposed) {
          s.release().catch(() => {});
          return;
        }
        sentinel = s;
        s.addEventListener("release", () => {
          if (sentinel === s) sentinel = null;
          request();
        });
      } catch {
        // 取得失敗時は定期再試行・表示復帰時に取り直す
      } finally {
        requesting = false;
      }
    };

    request();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", request);
    window.addEventListener("pageshow", request);
    const timer = setInterval(request, RETRY_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", request);
      window.removeEventListener("pageshow", request);
      sentinel?.release().catch(() => {});
    };
  }, []);

  return null;
}
