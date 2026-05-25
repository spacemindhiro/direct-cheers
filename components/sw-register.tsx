'use client';

import { useEffect } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// グローバルに早期捕捉 — Reactのマウントより前にイベントが来ても逃さない
if (typeof window !== 'undefined') {
  (window as any).__pwaPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    (window as any).__pwaPrompt = e;
    window.dispatchEvent(new Event('pwa-ready'));
  });
}

export function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
