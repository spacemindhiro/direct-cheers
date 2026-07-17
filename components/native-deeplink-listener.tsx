"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

// タッチ決済アプリ（Capacitorラップ）でのみ動作するディープリンク受信。
// スタッフスマホが生成したQRログインURL（/auth/qr/<token>）をPixelのカメラで
// スキャンするとOSがアプリを起動し、ここでWebView内の同パスへ遷移させることで
// アプリ内にログインセッションを確立する。ブラウザ・PWAでは何もしない。
export function NativeDeeplinkListener() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const navigate = (urlStr: string) => {
      try {
        const url = new URL(urlStr);
        // 受け付けるのはQRログインのみ（任意URLへの遷移は許可しない）
        if (!url.pathname.startsWith("/auth/qr/")) return;
        // ワンタイムトークンのため同一URLへの遷移は一度だけ。
        // getLaunchUrlはリロード後も同じ起動URLを返し続けるため、ガードが無いと
        // ページ読み込みのたびに再遷移してトークンを競合消費してしまう。
        const guardKey = `qr-login-handled:${url.pathname}`;
        if (sessionStorage.getItem(guardKey)) return;
        sessionStorage.setItem(guardKey, "1");
        // ホスト部は捨ててWebView自身のオリジンで開く（本番/開発の差異を吸収）
        window.location.href = url.pathname;
      } catch {
        // 不正なURLは無視
      }
    };

    // コールドスタート時（アプリ未起動でQRを開いた場合）
    App.getLaunchUrl().then((launch) => {
      if (launch?.url) navigate(launch.url);
    });

    // アプリ起動中に受け取った場合
    const subscription = App.addListener("appUrlOpen", ({ url }) => navigate(url));
    return () => {
      subscription.then((s) => s.remove());
    };
  }, []);

  return null;
}
