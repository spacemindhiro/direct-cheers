"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Printer, CheckCircle } from "lucide-react";

export function QRDisplay({
  qrConfigId,
  qrUrl,
  label,
}: {
  qrConfigId: string;
  qrUrl: string;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    import("qrcode").then(({ default: QRCode }) => {
      QRCode.toCanvas(canvasRef.current!, qrUrl, {
        width: 280,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).catch(console.error);
    });
  }, [qrUrl]);

  const handleCopy = () => {
    navigator.clipboard.writeText(qrUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handlePrint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${label}</title>
          <style>
            body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; }
            img { width: 280px; height: 280px; }
            p { margin: 12px 0 4px; font-size: 18px; font-weight: 900; }
            small { font-size: 11px; color: #666; word-break: break-all; max-width: 280px; text-align: center; }
          </style>
        </head>
        <body onload="window.print()">
          <p>${label}</p>
          <img src="${dataUrl}" />
          <small>${qrUrl}</small>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="space-y-6">
      {/* QRコード */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 flex flex-col items-center gap-6">
        <div className="bg-white p-4 rounded-2xl shadow-lg">
          <canvas ref={canvasRef} />
        </div>

        {/* URL */}
        <div className="w-full space-y-2">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">URL</p>
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
            <span className="flex-1 text-xs text-slate-300 font-mono truncate">{qrUrl}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 text-slate-500 hover:text-white transition-colors"
            >
              {copied ? (
                <CheckCircle size={16} className="text-green-400" />
              ) : (
                <Copy size={16} />
              )}
            </button>
          </div>
        </div>

        {/* ID */}
        <div className="w-full space-y-2">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">QR Config ID</p>
          <p className="text-xs text-slate-600 font-mono">{qrConfigId}</p>
        </div>
      </div>

      {/* 印刷ボタン */}
      <button
        type="button"
        onClick={handlePrint}
        className="w-full h-14 flex items-center justify-center gap-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all"
      >
        <Printer size={18} /> 印刷する
      </button>
    </div>
  );
}
