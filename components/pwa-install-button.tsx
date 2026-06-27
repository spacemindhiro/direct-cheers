'use client';

import { useEffect, useState } from 'react';
import { Download, CheckCircle, MoreVertical } from 'lucide-react';
import type { BeforeInstallPromptEvent } from './sw-register';

type Status = 'checking' | 'installed' | 'installable' | 'manual';

export function PwaInstallButton() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) {
      setStatus('installed');
      return;
    }
    if ((window as any).__pwaPrompt) {
      setStatus('installable');
      return;
    }
    // 一度インストール済みの端末ではbeforeinstallpromptが再発火しないため、
    // 一定時間待っても来なければ手動手順にフォールバックする
    setStatus('manual');
    const handler = () => setStatus('installable');
    window.addEventListener('pwa-ready', handler);
    window.addEventListener('appinstalled', () => setStatus('installed'));
    return () => window.removeEventListener('pwa-ready', handler);
  }, []);

  const handleInstall = async () => {
    const prompt = (window as any).__pwaPrompt as BeforeInstallPromptEvent | null;
    if (!prompt) return;
    await prompt.prompt();
    (window as any).__pwaPrompt = null;
    setStatus('installed');
  };

  if (status === 'checking') return null;

  if (status === 'installed') {
    return (
      <p className="flex items-center gap-2 text-xs text-emerald-400 font-bold">
        <CheckCircle size={14} /> インストール済みです
      </p>
    );
  }

  if (status === 'installable') {
    return (
      <button
        onClick={handleInstall}
        className="w-full flex items-center justify-center gap-2 h-12 bg-indigo-600 hover:brightness-110 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
      >
        <Download size={15} />
        アプリとしてインストール
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
        <MoreVertical size={14} className="text-slate-400" />
      </div>
      <p className="text-xs text-slate-400">
        Chrome右上の「⋮」メニューから「アプリをインストール」または「ホーム画面に追加」を選択してください
      </p>
    </div>
  );
}
