"use client";

import { DISPLAY_TZ } from "@/lib/display-tz";
import { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { CheckCircle, XCircle, AlertCircle, QrCode, Loader2, ArrowLeft, Users } from "lucide-react";
import Link from "next/link";

type CheckinResult = {
  ok?: boolean;
  error?: string;
  event_title?: string;
  product_name?: string;
  email?: string;
  is_voucher?: boolean;
  quantity?: number;
  ticket?: { checked_in_at?: string | null };
};

type LogEntry = {
  id: string;
  time: string;
  code: string;
  result: CheckinResult;
  status: "success" | "error" | "warn";
};

function errorMessage(error?: string): string {
  switch (error) {
    case "TICKET_NOT_FOUND": return "無効なチケット";
    case "TICKET_CANCELLED": return "キャンセル済み";
    case "PAYMENT_FAILED": return "決済失敗";
    default: return "エラー";
  }
}

export function CheckinClient() {
  const params = useParams<{ eventId: string }>();
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [overlay, setOverlay] = useState<{ status: "success" | "error" | "warn"; result: CheckinResult } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const scannerDivId = "qr-scanner-container";
  const lastScannedRef = useRef<string>("");
  const scanCooldownRef = useRef(false);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showOverlay = (status: "success" | "error" | "warn", result: CheckinResult) => {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    setOverlay({ status, result });
    overlayTimerRef.current = setTimeout(() => setOverlay(null), 2500);
  };

  const processCheckin = useCallback(async (code: string) => {
    if (scanCooldownRef.current || processing) return;
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
      const status = data.ok ? "success" : data.error === "ALREADY_USED" ? "warn" : "error";
      showOverlay(status, data);
      setLog((prev) => [{
        id: `${Date.now()}-${Math.random()}`,
        time: new Date().toLocaleTimeString("ja-JP", { timeZone: DISPLAY_TZ }),
        code: code.slice(0, 8) + "...",
        result: data,
        status,
      }, ...prev.slice(0, 49)]);
    } catch {
      const data = { error: "通信エラー" };
      showOverlay("error", data);
      setLog((prev) => [{
        id: `${Date.now()}`,
        time: new Date().toLocaleTimeString("ja-JP", { timeZone: DISPLAY_TZ }),
        code: code.slice(0, 8) + "...",
        result: data,
        status: "error",
      }, ...prev.slice(0, 49)]);
    } finally {
      setProcessing(false);
    }
  }, [processing]);

  const startScanner = useCallback(() => { setScanning(true); }, []);
  // stop は useEffect クリーンアップに一本化（2重呼び出し防止）
  const stopScanner = useCallback(() => { setScanning(false); }, []);

  useEffect(() => {
    if (!scanning) return;
    let mounted = true;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (!mounted) return;
      const scanner = new Html5Qrcode(scannerDivId);
      scanner.start(
        { facingMode: "environment" },
        { fps: 15, qrbox: { width: 300, height: 300 } },
        (decodedText: string) => { processCheckin(decodedText); },
        () => {},
      ).then(() => {
        if (mounted) scannerRef.current = scanner;
      }).catch(() => {
        if (mounted) setScanning(false);
      });
    });
    return () => {
      mounted = false;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) s.stop().catch(() => {});
    };
  }, [scanning, processCheckin]);

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
        <div className="space-y-1">
          <Link href={`/dashboard/events/${params.eventId}`} className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs font-bold mb-3 transition-colors">
            <ArrowLeft size={12} /> イベントに戻る
          </Link>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Check-in</p>
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">入場スキャナ</h1>
        </div>

        {/* スキャン結果サマリー（スキャン停止中に最新結果を表示） */}
        {!scanning && latestEntry && (
          <div className={`rounded-2xl p-4 border ${
            latestEntry.status === "success" ? "bg-green-500/10 border-green-500/30" :
            latestEntry.status === "warn"    ? "bg-amber-500/10 border-amber-500/30" :
                                               "bg-red-500/10 border-red-500/30"
          }`}>
            <div className="flex items-start gap-3">
              {latestEntry.status === "success" ? <CheckCircle size={20} className="text-green-400 shrink-0 mt-0.5" /> :
               latestEntry.status === "warn"    ? <AlertCircle size={20} className="text-amber-400 shrink-0 mt-0.5" /> :
                                                  <XCircle size={20} className="text-red-400 shrink-0 mt-0.5" />}
              <div>
                <p className={`font-black text-sm ${
                  latestEntry.status === "success" ? "text-green-400" :
                  latestEntry.status === "warn"    ? "text-amber-400" : "text-red-400"
                }`}>
                  {latestEntry.status === "success"
                    ? latestEntry.result.is_voucher
                      ? `【引換成功】${latestEntry.result.product_name ?? ""}`
                      : "入場OK"
                    : latestEntry.status === "warn"
                      ? latestEntry.result.is_voucher ? "引き換え済みです" : "入場済みです"
                    : errorMessage(latestEntry.result.error)}
                </p>
                {latestEntry.result.ok && (
                  <div className="text-xs text-slate-300 mt-1 space-y-0.5">
                    {latestEntry.result.product_name && <p>{latestEntry.result.product_name}</p>}
                    {!!latestEntry.result.quantity && latestEntry.result.quantity > 1 && (
                      <p className="text-indigo-400 font-black">{latestEntry.result.quantity}名分</p>
                    )}
                    {latestEntry.result.email && <p className="text-slate-500">{latestEntry.result.email}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden">
          {!scanning ? (
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center">
                {processing ? <Loader2 size={24} className="text-indigo-400 animate-spin" /> : <QrCode size={24} className="text-indigo-400" />}
              </div>
              <div>
                <p className="text-sm font-black text-white">QRスキャナを起動</p>
                <p className="text-xs text-slate-500 mt-1">カメラを使ってチケットQRを読み取ります</p>
              </div>
              <button type="button" onClick={startScanner} className="w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all">
                カメラを起動
              </button>
            </div>
          ) : (
            <div className="relative">
              {/* カメラ映像 */}
              <div id={scannerDivId} className="w-full" />

              {/* スキャン結果バナー（上部10%） */}
              {overlay && (
                <div className={`absolute top-0 left-0 right-0 flex items-center gap-3 px-4 py-3 ${
                  overlay.status === "success" ? "bg-green-500/95" :
                  overlay.status === "warn"    ? "bg-amber-500/95" :
                                                 "bg-red-500/95"
                }`}>
                  {overlay.status === "success"
                    ? <CheckCircle size={22} className="text-white shrink-0" />
                    : overlay.status === "warn"
                    ? <AlertCircle size={22} className="text-white shrink-0" />
                    : <XCircle size={22} className="text-white shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-white font-black text-sm leading-tight">
                      {overlay.status === "success"
                        ? overlay.result.is_voucher
                          ? `【引換成功】${overlay.result.product_name ?? ""}`
                          : "入場OK"
                        : overlay.status === "warn"
                          ? overlay.result.is_voucher
                            ? `引き換え済み${overlay.result.ticket?.checked_in_at ? `（${new Date(overlay.result.ticket.checked_in_at).toLocaleTimeString("ja-JP", { timeZone: DISPLAY_TZ, hour: "2-digit", minute: "2-digit" })}）` : ""}`
                            : `入場済み${overlay.result.ticket?.checked_in_at ? `（${new Date(overlay.result.ticket.checked_in_at).toLocaleTimeString("ja-JP", { timeZone: DISPLAY_TZ, hour: "2-digit", minute: "2-digit" })}）` : ""}`
                          : errorMessage(overlay.result.error)}
                    </p>
                    {!!overlay.result.quantity && overlay.result.quantity > 1 && (
                      <p className="text-white font-black text-xs">{overlay.result.quantity}名分</p>
                    )}
                    {overlay.result.email && overlay.status !== "warn" && (
                      <p className="text-white/80 text-xs truncate">{overlay.result.email}</p>
                    )}
                  </div>
                  {processing && <Loader2 size={16} className="text-white/70 animate-spin ml-auto shrink-0" />}
                </div>
              )}

              {/* 処理中インジケーター */}
              {processing && !overlay && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 size={40} className="text-white animate-spin" />
                </div>
              )}

              <div className="p-4">
                <button type="button" onClick={stopScanner} className="w-full h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
                  スキャナを停止
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">コード手動入力</p>
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="チケットコードを入力"
              className="flex-1 bg-slate-800 border border-slate-700 focus:border-indigo-500/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition-colors font-mono"
            />
            <button type="submit" disabled={!manualCode.trim() || processing} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50">
              {processing ? <Loader2 size={14} className="animate-spin" /> : "入場"}
            </button>
          </form>
        </div>

        {log.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users size={12} className="text-slate-600" />
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">スキャンログ ({log.length})</p>
            </div>
            <div className="space-y-2">
              {log.map((entry) => (
                <div key={entry.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-xs ${
                  entry.status === "success" ? "bg-green-500/5 border-green-500/20" :
                  entry.status === "warn"    ? "bg-amber-500/5 border-amber-500/20" :
                                               "bg-red-500/5 border-red-500/20"
                }`}>
                  {entry.status === "success" ? <CheckCircle size={12} className="text-green-400 shrink-0" /> :
                   entry.status === "warn"    ? <AlertCircle size={12} className="text-amber-400 shrink-0" /> :
                                                <XCircle size={12} className="text-red-400 shrink-0" />}
                  <span className="text-slate-600 font-mono shrink-0">{entry.time}</span>
                  <span className={`font-bold shrink-0 ${
                    entry.status === "success" ? "text-green-400" :
                    entry.status === "warn"    ? "text-amber-400" : "text-red-400"
                  }`}>
                    {entry.status === "success" ? "OK" : entry.status === "warn" ? "入場済" : errorMessage(entry.result.error)}
                  </span>
                  {!!entry.result.quantity && entry.result.quantity > 1 && (
                    <span className="text-indigo-400 font-black shrink-0">{entry.result.quantity}名</span>
                  )}
                  {entry.status === "warn" && entry.result.ticket?.checked_in_at && (
                    <span className="text-amber-500/70 shrink-0">
                      {new Date(entry.result.ticket.checked_in_at).toLocaleTimeString("ja-JP", { timeZone: DISPLAY_TZ, hour: "2-digit", minute: "2-digit" })}入場
                    </span>
                  )}
                  {entry.result.email && entry.status !== "warn" && <span className="text-slate-500 truncate">{entry.result.email}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
