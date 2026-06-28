"use client";

import { useState, useEffect } from "react";
import { X, Copy, Check, ExternalLink } from "lucide-react";

type Platform = 'ios' | 'android' | 'unknown';
type Detection = { inApp: boolean; appName: string; platform: Platform };

function detect(ua: string): Detection {
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const platform: Platform = isIOS ? 'ios' : isAndroid ? 'android' : 'unknown';

  if (/Line\//i.test(ua))   return { inApp: true, appName: "LINE",        platform };
  if (/Instagram/.test(ua)) return { inApp: true, appName: "Instagram",   platform };
  if (/FBAN|FBAV/.test(ua)) return { inApp: true, appName: "Facebook",    platform };
  if (/Twitter/.test(ua))   return { inApp: true, appName: "X (Twitter)", platform };
  if (/TikTok/.test(ua))    return { inApp: true, appName: "TikTok",      platform };

  // iOS で Safari 以外（Chrome iOS / Firefox iOS 等）
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) && !/Chrome/.test(ua);
  if (isIOS && !isSafari) return { inApp: true, appName: "", platform: 'ios' };

  return { inApp: false, appName: "", platform };
}

function buildChromeIntentUrl(href: string): string {
  const u = new URL(href);
  return `intent://${u.hostname}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;end`;
}

export function InAppBrowserBanner() {
  const [show, setShow] = useState(false);
  const [appName, setAppName] = useState("");
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [copied, setCopied] = useState(false);
  const [intentUrl, setIntentUrl] = useState("");
  const [safariUrl, setSafariUrl] = useState("");

  useEffect(() => {
    const result = detect(navigator.userAgent);
    if (result.inApp) {
      setShow(true);
      setAppName(result.appName);
      setPlatform(result.platform);
      if (result.platform === "android") {
        setIntentUrl(buildChromeIntentUrl(window.location.href));
      }
      // x-safari-https:// はApple非公式だが長年実績のあるスキーム。
      // LINE等のアプリ内WebViewはこのスキームをハンドルできないことが多いため、
      // 名前付きアプリ（appName非空）では出さず、iOS+非Safariブラウザ（Chrome等）限定で使う。
      if (result.platform === "ios" && result.appName === "") {
        setSafariUrl(window.location.href.replace(/^https?:\/\//, "x-safari-https://"));
      }
    }
  }, []);

  if (!show) return null;

  const payService = platform === "ios" ? "Apple Pay" : platform === "android" ? "Google Pay" : "Apple Pay / Google Pay";
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
      <div className="max-w-md mx-auto space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">{payService}</p>
            <p className="text-xs font-bold text-amber-200 leading-relaxed">
              {isNamedApp ? `${appName}内ブラウザでは` : "このブラウザでは"}
              {payService}が使えません。
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Stripe Link・カードはこのままご利用いただけます。
            </p>
          </div>
          <button
            onClick={() => setShow(false)}
            className="shrink-0 mt-0.5 text-amber-500/50 hover:text-amber-300 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex gap-2">
          {platform === "android" && intentUrl ? (
            <a
              href={intentUrl}
              className="flex items-center gap-1.5 h-8 px-3 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/20 rounded-lg text-[10px] font-black text-amber-300 transition-all"
            >
              <ExternalLink size={11} />
              Chromeで開く
            </a>
          ) : safariUrl ? (
            <a
              href={safariUrl}
              className="flex items-center gap-1.5 h-8 px-3 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/20 rounded-lg text-[10px] font-black text-amber-300 transition-all"
            >
              <ExternalLink size={11} />
              Safariで開く
            </a>
          ) : (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 h-8 px-3 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/20 rounded-lg text-[10px] font-black text-amber-300 transition-all"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? "コピーしました" : "URLをコピー（Safariで開く）"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
