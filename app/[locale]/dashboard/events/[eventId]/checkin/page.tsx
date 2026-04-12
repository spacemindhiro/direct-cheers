"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { CheckCircle, XCircle, AlertCircle, QrCode, Loader2, ArrowLeft, Users } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// html5-qrcode はブラウザ専用 → 型だけ参照
type Html5QrcodeScannerType = import("html5-qrcode").Html5QrcodeScanner;

type CheckinResult = {
  ok?: boolean;
  error?: string;
  event_title?: string;
  product_name?: string;
  email?: string;
};

type LogEntry = {
  id: string;
  time: string;
  code: string;
  result: CheckinResult;
  status: "success" | "error" | "warn";
};

export default function CheckinPage() {
  const params = useParams<{ eventId: string }>();
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<Html5QrcodeScannerType | null>(null);
  const scannerDivId = "qr-scanner-container";
  const lastScannedRef = useRef<string>("");
  const scanCooldownRef = useRef(false);

  const processCheckin = useCallback(async (code: string) => {
    if (scanCooldownRef.current || processing) return;
    if (code === lastScannedRef.current && Date.now() - Number(lastScannedRef.current) < 3000) return;
    lastScannedRef.current = code;
    scanCooldownRef.current = true;
    setTimeout(() => { scanCooldownRef.current = false; }, 3000);

    setProcessing(true);
    try {
      const res = await fetch("/api/entrance/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_code: code }),
      });
      const data: CheckinResult = await res.json();

      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random()}`,
        time: new Date().toLocaleTimeString("ja-JP"),
        code: code.slice(0, 8) + "...",
        result: data,
        status: data.ok ? "success" : data.error === "ALREADY_USED" ? "warn" : "error",
      };
      setLog((prev) => [entry, ...prev.slice(0, 49)]);
    } catch {
      setLog((prev) => [{
        id: `${Date.now()}`,
        time: new Date().toLocaleTimeString("ja-JP"),
        code: code.slice(0, 8) + "...",
        result: { error: "通信エラー" },
        status: "error",
      }, ...prev.slice(0, 49)]);
    } finally {
      setProcessing(false);
    }
  }, [processing]);

  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;
    setScanning(true);
    // ブラウザ専用ライブラリを動的ロード
    const { Html5QrcodeScanner, Html5QrcodeScanType } = await import("html5-qrcode");
    const scanner = new Html5QrcodeScanner(
      scannerDivId,
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        aspectRatio: 1.0,
      },
      false
    );
    scanner.render(
      (decodedText) => { processCheckin(decodedText); },
      () => {}
    );
    scannerRef.current = scanner;
  }, [processCheckin]);

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.clear().catch(() => {});
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    processCheckin(manualCode.trim());
    setManualCode("");
  };

  const latestEntry = log[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20">
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">

        {/* ヘッダー */}
        <div className="space-y-1">
          <Link
            href={`/dashboard/events/${params.eventId}`}
            className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-3 transition-colors"
          >
            <ArrowLeft size={12} />
            イベントに戻る
          </Link>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Check-in</p>
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
            入場スキャナ
          </h1>
        </div>

        {/* 最新スキャン結果 */}
        {latestEntry && (
          <div className={`rounded-2xl p-4 border transition-all ${
            latestEntry.status === "success"
              ? "bg-green-500/10 border-green-500/30"
              : latestEntry.status === "warn"
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-red-500/10 border-red-500/30"
          }`}>
            <div className="flex items-start gap-3">
              {latestEntry.status === "success" ? (
                <CheckCircle size={20} className="text-green-400 shrink-0 mt-0.5" />
              ) : latestEntry.status === "warn" ? (
                <AlertCircle size={20} className="text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`font-black text-sm ${
                  latestEntry.status === "success" ? "text-green-400" :
                  latestEntry.status === "warn" ? "text-amber-400" :
                  "text-red-400"
                }`}>
                  {latestEntry.status === "success"
                    ? "入場OK"
                    : latestEntry.status === "warn"
                    ? "入場済みです"
                    : errorMessage(latestEntry.result.error)}
                </p>
                {latestEntry.result.ok && (
                  <div className="text-xs text-slate-300 mt-1 space-y-0.5">
                    {latestEntry.result.product_name && (
                      <p>{latestEntry.result.product_name}</p>
                    )}
                    {latestEntry.result.email && (
                      <p className="text-slate-500">{latestEntry.result.email}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* QR スキャナ */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden">
          {!scanning ? (
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center">
                {processing ? (
                  <Loader2 size={24} className="text-indigo-400 animate-spin" />
                ) : (
                  <QrCode size={24} className="text-indigo-400" />
                )}
              </div>
              <div>
                <p className="text-sm font-black text-white">QRスキャナを起動</p>
                <p className="text-xs text-slate-500 mt-1">カメラを使ってチケットQRを読み取ります</p>
              </div>
              <button
                type="button"
                onClick={startScanner}
                className="w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all"
              >
                カメラを起動
              </button>
            </div>
          ) : (
            <div className="space-y-0">
              <div id={scannerDivId} className="w-full" />
              <div className="p-4">
                <button
                  type="button"
                  onClick={stopScanner}
                  className="w-full h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                >
                  スキャナを停止
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 手動入力 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            コード手動入力
          </p>
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="チケットコードを入力"
              className="flex-1 bg-slate-800 border border-slate-700 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition-colors font-mono"
            />
            <button
              type="submit"
              disabled={!manualCode.trim() || processing}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50"
            >
              {processing ? <Loader2 size={14} className="animate-spin" /> : "入場"}
            </button>
          </form>
        </div>

        {/* スキャンログ */}
        {log.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users size={12} className="text-slate-600" />
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                スキャンログ ({log.length})
              </p>
            </div>
            <div className="space-y-2">
              {log.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-xs ${
                    entry.status === "success"
                      ? "bg-green-500/5 border-green-500/20"
                      : entry.status === "warn"
                      ? "bg-amber-500/5 border-amber-500/20"
                      : "bg-red-500/5 border-red-500/20"
                  }`}
                >
                  {entry.status === "success" ? (
                    <CheckCircle size={12} className="text-green-400 shrink-0" />
                  ) : entry.status === "warn" ? (
                    <AlertCircle size={12} className="text-amber-400 shrink-0" />
                  ) : (
                    <XCircle size={12} className="text-red-400 shrink-0" />
                  )}
                  <span className="text-slate-600 font-mono shrink-0">{entry.time}</span>
                  <span className={`font-bold ${
                    entry.status === "success" ? "text-green-400" :
                    entry.status === "warn" ? "text-amber-400" :
                    "text-red-400"
                  }`}>
                    {entry.status === "success" ? "OK" :
                     entry.status === "warn" ? "入場済" :
                     errorMessage(entry.result.error)}
                  </span>
                  {entry.result.email && (
                    <span className="text-slate-500 truncate">{entry.result.email}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function errorMessage(error?: string): string {
  switch (error) {
    case "TICKET_NOT_FOUND": return "無効なチケット";
    case "TICKET_CANCELLED": return "キャンセル済み";
    case "PAYMENT_FAILED": return "決済失敗";
    default: return "エラー";
  }
}
