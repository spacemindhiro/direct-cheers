'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

export function PwaInstallButton() {
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferred = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const installed = () => {
      deferred = null;
      setCanInstall(false);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    deferred = null;
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
