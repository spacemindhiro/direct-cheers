"use client";

import { useState, useEffect } from "react";
import { X, Copy, Check } from "lucide-react";

type Platform = 'ios' | 'android' | 'unknown';
type Detection = { inApp: boolean; appName: string; platform: Platform };

function detect(ua: string): Detection {
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const platform: Platform = isIOS ? 'ios' : isAndroid ? 'android' : 'unknown';

  if (/Line\//i.test(ua))   return { inApp: true, appName: "LINE",       platform };
  if (/Instagram/.test(ua)) return { inApp: true, appName: "Instagram",  platform };
  if (/FBAN|FBAV/.test(ua)) return { inApp: true, appName: "Facebook",   platform };
  if (/Twitter/.test(ua))   return { inApp: true, appName: "X (Twitter)", platform };
  if (/TikTok/.test(ua))    return { inApp: true, appName: "TikTok",     platform };

  // iOS で Safari 以外（Chrome iOS / Firefox iOS 等）
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) && !/Chrome/.test(ua);
  if (isIOS && !isSafari) return { inApp: true, appName: "", platform: 'ios' };

  return { inApp: false, appName: "", platform };
}

export function InAppBrowserBanner() {
  const [show, setShow] = useState(false);
  const [appName, setAppName] = useState("");
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const result = detect(navigator.userAgent);
    if (result.inApp) {
      setShow(true);
      setAppName(result.appName);
      setPlatform(result.platform);
    }
  }, []);

  if (!show) return null;

  const payService = platform === 'ios' ? 'Apple Pay' : platform === 'android' ? 'Google Pay' : 'Apple Pay / Google Pay';
  const targetBrowser = platform === 'android' ? 'Chrome' : 'Safari';
  const isNamedApp = appName !== "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  };

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-4">
      <div className="max-w-md mx-auto space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">{payService}</p>
            <p className="text-xs font-bold text-amber-200 leading-relaxed">
              {isNamedApp
                ? `${appName}内ブラウザでは${payService}が使えません。`
                : `このブラウザでは${payService}が使えません。`}
              {" "}{targetBrowser}で開いてください。
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
            右上の「…」メニュー →「ブラウザで開く」または「{targetBrowser}で開く」
          </p>
        )}

        <button
          onClick={handleCopy}
          className="flex items-center gap-2 h-8 px-3 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/20 rounded-lg text-[10px] font-black text-amber-300 transition-all"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "コピーしました" : `URLをコピー（${targetBrowser}に貼り付け）`}
        </button>
      </div>
    </div>
  );
}
