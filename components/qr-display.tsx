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
            /* vw/vhは印刷経路(document.writeしたポップアップ→window.print())だと
               実際の用紙サイズではなくポップアップの画面上のウィンドウサイズを基準に
               計算されてしまうことがあり、拡大・中央寄せが効かない原因になる。
               そのため一切使わず、印刷でも常に正確な物理単位(mm)で固定する。
               縦横の切り替えは@media print (orientation:...)で用紙の実寸に応じて
               body自体のサイズを入れ替えることで対応する。 */
            * { box-sizing: border-box; }
            @page { size: A4; margin: 10mm; }
            html, body {
              margin: 0; padding: 0;
              overflow: hidden;
              font-family: sans-serif;
            }
            body {
              /* 既定(縦向き): A4(210x297mm)から@pageのmargin10mm×2を引いた
                 コンテンツ領域の実寸 */
              width: 190mm; height: 277mm;
              display: flex; flex-direction: column; align-items: center; justify-content: center;
            }
            @media print and (orientation: landscape) {
              body { width: 277mm; height: 190mm; }
            }
            .qr-wrap {
              flex: 1 1 auto; width: 100%; min-height: 0;
              display: flex; align-items: center; justify-content: center;
            }
            img {
              /* 横向き印刷時は使える高さが190mm分しかなく、下記のラベル文字を
                 2m離れても読めるサイズまで拡大した分の余白も見込んで140mm角に固定。 */
              width: 140mm; height: 140mm;
            }
            p {
              /* 2m離れても読めることを想定した文字サイズ（目安: 1m離れるごとに
                 文字高さ約8〜10mm、2mなら約16〜20mm。前後の余白込みで最大2行を許容） */
              flex: 0 0 auto; width: 100%;
              margin: 0 0 5mm; font-size: 14mm; line-height: 1.15; font-weight: 900; text-align: center;
            }
            small {
              flex: 0 0 auto; width: 100%;
              margin-top: 5mm; font-size: 3mm; line-height: 1.3; color: #666;
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
