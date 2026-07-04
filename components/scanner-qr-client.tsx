"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw, Tablet } from "lucide-react";

const EXPIRY_SECONDS = 3600;

export function ScannerQrClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState(EXPIRY_SECONDS);
  const generatedAtRef = useRef<number | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/scanner-qr", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成失敗");
      setUrl(data.url);
      setRemaining(EXPIRY_SECONDS);
      generatedAtRef.current = Date.now();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { generate(); }, [generate]);

  // QRコードを canvas に描画（コンテナ幅いっぱいに表示）
  useEffect(() => {
    if (!url || !canvasRef.current) return;
    const container = containerRef.current;
    // パディング(16px×2)を引いた幅、最低320px
    const size = container ? Math.max(320, container.offsetWidth - 32) : 320;
    import("qrcode").then(({ default: QRCode }) => {
      QRCode.toCanvas(canvasRef.current!, url, {
        width: size,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).catch(console.error);
    });
  }, [url]);

  // カウントダウン
  useEffect(() => {
    if (!generatedAtRef.current) return;
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - (generatedAtRef.current ?? 0)) / 1000);
      const left = Math.max(0, EXPIRY_SECONDS - elapsed);
      setRemaining(left);
      if (left === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [url]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const isExpired = remaining === 0;

  return (
    <div className="space-y-6">
      <div ref={containerRef} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-4 flex flex-col items-center gap-6">
        <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest">
          <Tablet size={14} />
          子機ログインQR
        </div>

        {loading && (
          <div className="w-full aspect-square bg-slate-800 rounded-2xl flex items-center justify-center">
            <RefreshCw size={32} className="text-slate-600 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="w-full aspect-square bg-slate-800 rounded-2xl flex flex-col items-center justify-center gap-3 p-6">
            <p className="text-red-400 text-xs text-center">{error}</p>
            <button onClick={generate} className="text-xs font-black text-pink-500 hover:text-pink-400">
              再試行
            </button>
          </div>
        )}

        {!loading && url && (
          <>
            <div className={`bg-white p-1 rounded-2xl shadow-lg w-full ${isExpired ? "opacity-30" : ""}`}>
              <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto" }} />
            </div>

            <div className="flex items-center gap-3">
              <span className={`font-mono text-lg font-black ${isExpired ? "text-red-400" : remaining < 300 ? "text-amber-400" : "text-emerald-400"}`}>
                {isExpired ? "期限切れ" : `${mm}:${ss}`}
              </span>
              <button
                onClick={generate}
                disabled={loading}
                className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 hover:text-pink-500 uppercase tracking-widest transition-colors"
              >
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                再生成
              </button>
            </div>
          </>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-2">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">使い方</p>
        <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
          <li>子機タブレットのカメラアプリでQRをスキャン</li>
          <li>ブラウザが開いてこのアカウントで自動ログイン</li>
          <li>パスキー登録はスキップしてOK（子機には登録しない）</li>
          <li>有効期限1時間。期限切れは再生成してください</li>
        </ol>
      </div>
    </div>
  );
}
