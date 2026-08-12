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

  const handlePrint = async () => {
    // 画面表示用canvasは280pxしかなく、A4いっぱいに拡大すると粗くなるため、
    // 印刷専用に高解像度のQRを別途生成する。
    const { default: QRCode } = await import("qrcode");
    const printCanvas = document.createElement("canvas");
    await QRCode.toCanvas(printCanvas, qrUrl, {
      width: 2000,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(console.error);
    const dataUrl = printCanvas.toDataURL("image/png");

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${label}</title>
          <style>
            /* @page sizeはプレビュー時の初期用紙をA4に寄せるヒント。
               実際の用紙サイズ・縦横は印刷ダイアログの設定が優先される。
               vw/vhは印刷時、選択された用紙の向き基準で解決されるため、
               縦横どちらを選んでもその中で最大化される。
               html/bodyにoverflow: hiddenを掛け、万一コンテンツが計算上
               はみ出しても2ページ目に溢れず必ず1ページに収まるようにする。 */
            * { box-sizing: border-box; }
            @page { size: A4; margin: 10mm; }
            html, body {
              margin: 0; padding: 0;
              width: 100vw; height: 100vh;
              overflow: hidden;
              font-family: sans-serif;
            }
            body {
              display: flex; flex-direction: column; align-items: center; justify-content: center;
            }
            .qr-wrap {
              flex: 1 1 auto; width: 100%; min-height: 0;
              display: flex; align-items: center; justify-content: center;
            }
            img {
              width: auto; height: auto;
              max-width: 85vw;
              max-height: 65vh;
            }
            p {
              flex: 0 0 auto; max-width: 90vw;
              margin: 0 0 4mm; font-size: 20px; font-weight: 900; text-align: center;
            }
            small {
              flex: 0 0 auto; max-width: 90vw;
              margin-top: 4mm; font-size: 10px; line-height: 1.4; color: #666;
              word-break: break-all; text-align: center;
            }
          </style>
        </head>
        <body onload="window.print()">
          <p>${label}</p>
          <div class="qr-wrap"><img src="${dataUrl}" /></div>
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
