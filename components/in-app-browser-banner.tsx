"use client";

import { useState, useEffect } from "react";
import { X, Copy, Check } from "lucide-react";

type Detection = { inApp: boolean; appName: string };

function detect(ua: string): Detection {
  if (/Line\//i.test(ua))     return { inApp: true, appName: "LINE" };
  if (/Instagram/.test(ua))   return { inApp: true, appName: "Instagram" };
  if (/FBAN|FBAV/.test(ua))   return { inApp: true, appName: "Facebook" };
  if (/Twitter/.test(ua))     return { inApp: true, appName: "X (Twitter)" };
  if (/TikTok/.test(ua))      return { inApp: true, appName: "TikTok" };

  // iOS で Safari 以外（Chrome iOS / Firefox iOS 等）
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) && !/Chrome/.test(ua);
  if (isIOS && !isSafari) return { inApp: true, appName: "" };

  return { inApp: false, appName: "" };
}

export function InAppBrowserBanner() {
  const [show, setShow] = useState(false);
  const [appName, setAppName] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const { inApp, appName: name } = detect(navigator.userAgent);
    if (inApp) {
      setShow(true);
      setAppName(name);
    }
  }, []);

  if (!show) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  };

  const isNamedApp = appName !== "";

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-4">
      <div className="max-w-md mx-auto space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Apple Pay / Google Pay</p>
            <p className="text-xs font-bold text-amber-200 leading-relaxed">
              {isNamedApp
                ? `${appName}内ブラウザではApple Payが使えません。`
                : "このブラウザではApple Payが使えません。"}
              {" "}Safariで開いてください。
            </p>
          </div>
          <button
            onClick={() => setShow(false)}
            className="shrink-0 mt-0.5 text-amber-500/50 hover:text-amber-300 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {isNamedApp && (
          <p className="text-[10px] text-amber-400/70 leading-relaxed">
            右上の「…」メニュー →「ブラウザで開く」または「Safariで開く」
          </p>
        )}

        <button
          onClick={handleCopy}
          className="flex items-center gap-2 h-8 px-3 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/20 rounded-lg text-[10px] font-black text-amber-300 transition-all"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "コピーしました" : "URLをコピー（Safariに貼り付け）"}
        </button>
      </div>
    </div>
  );
}
