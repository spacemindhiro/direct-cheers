'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { BeforeInstallPromptEvent } from './sw-register';

export function PwaInstallButton() {
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    // マウント時点でもう捕捉済みなら即表示
    if ((window as any).__pwaPrompt) {
      setCanInstall(true);
    }
    // まだなら発火を待つ
    const handler = () => setCanInstall(true);
    window.addEventListener('pwa-ready', handler);
    window.addEventListener('appinstalled', () => {
      (window as any).__pwaPrompt = null;
      setCanInstall(false);
    });
    return () => window.removeEventListener('pwa-ready', handler);
  }, []);

  const handleInstall = async () => {
    const prompt = (window as any).__pwaPrompt as BeforeInstallPromptEvent | null;
    if (!prompt) return;
    await prompt.prompt();
    (window as any).__pwaPrompt = null;
    setCanInstall(false);
  };

  if (!canInstall) return null;

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
