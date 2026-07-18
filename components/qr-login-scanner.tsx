"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, QrCode, X, AlertCircle } from "lucide-react";

// 親機アプリ(Capacitor)でのQRログイン。OSのApp Links（カメラアプリ→ブラウザ/アプリの
// 振り分け）は端末の「常にこのアプリで開く」記憶に左右されて信頼できないため、
// 入場スキャナと同じhtml5-qrcodeでこのWebView自身のカメラで読み取り、
// window.location.hrefで同一WebView内遷移させる（OSのIntent解決を経由しない）。
export function QrLoginScanner({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState("");
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const handledRef = useRef(false);
  const containerId = "qr-login-scanner-container";

  const handleScan = useCallback((decodedText: string) => {
    if (handledRef.current) return;
    // 自サイトの /auth/qr/ 以外への遷移は許可しない（QRは外部入力のため防御する）
    let url: URL;
    try {
      url = new URL(decodedText);
    } catch {
      setError("QRコードを読み取れませんでした。ログインQR（scanner-qr画面のもの）をご利用ください");
      return;
    }
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/auth/qr/")) {
      setError("これはログイン用のQRコードではありません");
      return;
    }
    handledRef.current = true;
    window.location.href = decodedText;
  }, []);

  useEffect(() => {
    let mounted = true;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (!mounted) return;
      const scanner = new Html5Qrcode(containerId);
      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decodedText: string) => handleScan(decodedText),
          () => {}
        )
        .then(() => {
          if (mounted) scannerRef.current = scanner;
        })
        .catch(() => {
          if (mounted) setError("カメラを起動できませんでした。カメラへのアクセスを許可してください");
        });
    });
    return () => {
      mounted = false;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) s.stop().catch(() => {});
    };
  }, [handleScan]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2 text-sm font-black text-white">
          <QrCode size={16} className="text-pink-500" /> QRでログイン
        </div>
        <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center">
          <X size={16} className="text-slate-400" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <div id={containerId} className="w-full max-w-sm rounded-[2rem] overflow-hidden" />
        {!error && (
          <p className="text-xs text-slate-500 text-center">
            スタッフ端末の「scanner-qr」画面に表示されたQRコードを映してください
          </p>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-xs max-w-sm">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}
        {!scannerRef.current && !error && (
          <Loader2 size={20} className="text-slate-600 animate-spin" />
        )}
      </div>
    </div>
  );
}
