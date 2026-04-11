'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Smartphone, ArrowRight, Zap, Music, Home, Settings, LayoutDashboard, ExternalLink } from "lucide-react";

export default function DemoEntrancePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const CHEERS_URL = "/demo/cheers";

  useEffect(() => {
    const generateQR = async () => {
      if (typeof window === 'undefined') return;
      const host = window.location.origin;
      const targetUrl = `${host}${CHEERS_URL}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(targetUrl)}`;
      
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = qrUrl;
      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, 300, 300);
          }
        }
      };
    };
    generateQR();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden font-sans">
      {/* 1. ナビゲーションヘッダー（追加） */}
      <nav className="fixed top-0 w-full z-50 bg-slate-950/50 backdrop-blur-xl border-b border-white/5 px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group text-slate-400 hover:text-white transition-colors">
            <Home size={18} />
            <span className="text-xs font-bold uppercase tracking-widest">Main Home</span>
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <LayoutDashboard size={18} className="text-pink-500" />
            <span className="text-xs font-black uppercase tracking-widest">Demo Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="text-slate-500 hover:text-white transition-colors">
            <Settings size={20} />
          </button>
        </div>
      </nav>

      {/* 背景装飾 */}
      <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-pink-500/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />

      {/* メインコンテンツ（ワイドレイアウト） */}
      <main className="max-w-6xl mx-auto pt-32 pb-20 px-8 relative z-10 grid md:grid-cols-2 gap-16 items-center">
        
        {/* 左側：コンテンツ説明 */}
        <div className="space-y-8 text-left animate-in fade-in slide-in-from-left-8 duration-1000">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-pink-500/10 border border-pink-500/20 rounded-full">
              <SparkleIcon />
              <span className="text-[10px] font-black uppercase tracking-widest text-pink-400 text-pretty">Sandbox Environment v1.0</span>
            </div>
            <h1 className="text-6xl lg:text-7xl font-black italic tracking-tighter uppercase leading-[0.9]">
              Live Venue <br />
              <span className="text-pink-500">Simulation</span>
            </h1>
            <p className="text-slate-400 text-lg font-medium leading-relaxed max-w-md">
              ライブ会場での「QRスキャン → 応援 → 決済 → デジタル証明書」の一連のフローをテストできます。
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Test Shortcuts</p>
            <div className="grid grid-cols-1 gap-4">
              <Link 
                href={CHEERS_URL}
                className="group flex items-center justify-between bg-slate-900 border border-slate-800 p-6 rounded-3xl hover:bg-white hover:text-slate-950 transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-pink-500 p-3 rounded-2xl text-white group-hover:bg-slate-950">
                    <Zap size={24} fill="currentColor" />
                  </div>
                  <div className="text-left">
                    <p className="font-black uppercase italic text-xl">Open Cheers Page</p>
                    <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest group-hover:text-slate-600">直接ページを開いてテスト</p>
                  </div>
                </div>
                <ArrowRight className="group-hover:translate-x-2 transition-transform" />
              </Link>
            </div>
          </div>
        </div>

        {/* 右側：QRシミュレーター（実績デザインを維持しつつ強調） */}
        <div className="flex flex-col items-center justify-center animate-in fade-in slide-in-from-right-8 duration-1000">
          <div className="relative group">
            <div className="absolute inset-0 bg-pink-500/20 blur-[60px] group-hover:bg-pink-500/30 transition-all duration-500" />
            
            <div className="relative bg-white p-10 rounded-[3.5rem] shadow-[0_0_50px_rgba(236,72,153,0.3)] w-80 h-80 flex flex-col items-center justify-center border-8 border-slate-900 overflow-hidden">
              <canvas 
                ref={canvasRef} 
                width={300} 
                height={300} 
                className="w-full h-full object-contain p-2"
              />
              <div className="mt-4 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Smartphone size={12} /> Scan with Mobile
              </div>
            </div>

            {/* 装飾タグ */}
            <div className="absolute -top-4 -right-4 bg-indigo-500 p-4 rounded-2xl shadow-xl border-4 border-slate-950 text-white animate-bounce">
              <ExternalLink size={24} />
            </div>
          </div>
          
          <div className="mt-10 text-center space-y-2">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
              会場掲示用QRコードのシミュレーション
            </p>
            <p className="text-slate-700 text-[10px] font-medium leading-relaxed uppercase">
              実際の運用ではこのQRを会場の各所に掲示し、<br />ファンがお手元の端末でスキャンします。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-pink-500">
      <path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9L12 2Z" fill="currentColor" />
    </svg>
  );
}