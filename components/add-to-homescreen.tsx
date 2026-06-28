'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, X, Share, MoreVertical, Smartphone, Compass } from 'lucide-react';

type Platform = 'android' | 'ios' | 'ios-non-safari' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) {
    // iOSではSafari以外のブラウザ（Chrome/Firefox/Edge等）の共有メニューに
    // 「ホーム画面に追加」が存在しないため、ホーム画面への追加自体ができない
    // （iOSの仕様上の制約）。CriOS/FxiOS/EdgiOSはそれぞれiOS版Chrome/Firefox/Edgeの識別子。
    if (/CriOS|FxiOS|EdgiOS/i.test(ua)) return 'ios-non-safari';
    return 'ios';
  }
  if (/android/i.test(ua)) return 'android';
  return 'other';
}

function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
}

export function AddToHomeScreen() {
  const searchParams = useSearchParams();
  const pwaForced = searchParams.get('pwa') === '1';
  const [platform, setPlatform] = useState<Platform>('other');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);

  useEffect(() => {
    // ホーム画面から起動済みなら表示しない
    if (isInStandaloneMode()) return;
    // ?pwa=1 以外は24時間以内に「後で」を押していたら表示しない
    if (!pwaForced) {
      const dismissed = localStorage.getItem('a2hs_dismissed');
      if (dismissed && Date.now() - Number(dismissed) < 24 * 60 * 60 * 1000) return;
    }

    const p = detectPlatform();
    setPlatform(p);

    if (p === 'android') {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShowBanner(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }

    if (p === 'ios' || p === 'ios-non-safari') {
      setShowBanner(true);
    }
  }, []);

  const handleInstall = async () => {
    if (platform === 'android' && deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    }
    if (platform === 'ios' || platform === 'ios-non-safari') {
      setShowIosModal(true);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('a2hs_dismissed', String(Date.now()));
    setShowBanner(false);
    setShowIosModal(false);
  };

  if (!showBanner) return null;

  return (
    <>
      {/* バナー */}
      <div className="bg-slate-900 border border-pink-500/20 rounded-[2rem] p-5 flex items-center gap-4">
        <div className="w-10 h-10 bg-pink-500/10 rounded-2xl flex items-center justify-center border border-pink-500/20 shrink-0">
          <Smartphone size={18} className="text-pink-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white">ホーム画面に追加</p>
          <p className="text-[10px] text-slate-500 font-medium mt-0.5">アプリのようにすぐ起動できます</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleInstall}
            className="h-9 px-4 bg-pink-500 hover:bg-pink-400 text-white rounded-xl font-black text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5"
          >
            <Plus size={14} /> 追加
          </button>
          <button
            onClick={handleDismiss}
            className="w-9 h-9 flex items-center justify-center text-slate-600 hover:text-slate-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* iOSの手順モーダル */}
      {showIosModal && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-[2.5rem] p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-white italic uppercase tracking-tighter">
                ホーム画面に追加
              </h2>
              <button onClick={handleDismiss} className="text-slate-500 hover:text-white transition-colors">
                <X size={22} />
              </button>
            </div>

            {platform === 'ios-non-safari' ? (
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 border border-slate-700">
                    <Compass size={16} className="text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">1. Safariでこのページを開く</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      iOSの仕様上、Chrome等からはホーム画面に追加できません。一度Safariで開いてください（最初だけです）
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 border border-slate-700">
                    <Share size={16} className="text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">2. 共有ボタンから追加</p>
                    <p className="text-xs text-slate-500 mt-0.5">Safari下部の共有アイコン →「ホーム画面に追加」</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 border border-slate-700">
                    <Smartphone size={16} className="text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">3. 以降はホーム画面のアイコンから起動</p>
                    <p className="text-xs text-slate-500 mt-0.5">ブラウザの種類は意識しなくて大丈夫です</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 border border-slate-700">
                    <Share size={16} className="text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">1. 共有ボタンをタップ</p>
                    <p className="text-xs text-slate-500 mt-0.5">Safariの下部にある共有アイコン（四角に矢印）</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 border border-slate-700">
                    <Plus size={16} className="text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">2.「ホーム画面に追加」を選択</p>
                    <p className="text-xs text-slate-500 mt-0.5">メニューをスクロールして見つけてください</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 border border-slate-700">
                    <MoreVertical size={16} className="text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">3.「追加」をタップして完了</p>
                    <p className="text-xs text-slate-500 mt-0.5">ホーム画面にDirect Cheersが追加されます</p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleDismiss}
              className="w-full h-14 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </>
  );
}
