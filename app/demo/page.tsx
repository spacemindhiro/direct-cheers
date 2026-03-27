'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Smartphone, ArrowRight, Zap, Music } from "lucide-react";

export default function DemoEntrancePage() {
  const [qrUrl, setQrUrl] = useState('');

  // ✅ さっきまで使っていたQR表示機能（動的生成）
  useEffect(() => {
    // 現在のドメインを取得して、遷移先のフルURLを作成
    const host = window.location.origin;
    const targetPath = `${host}/demo/cheers`;
    
    // Google Chart APIを使用してQRコード画像を生成
    const generatedQr = `https://chart.googleapis.com/chart?cht=qr&chs=250x250&chl=${encodeURIComponent(targetPath)}`;
    setQrUrl(generatedQr);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* 背景演出 */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-pink-500/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full" />

      <div className="max-w-md w-full text-center space-y-12 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
        
        <div className="space-y-4 text-pretty px-4">
          <div className="flex justify-center gap-2 mb-2">
            <Music className="text-pink-500 animate-pulse" size={24} />
            <Zap className="text-yellow-400 animate-bounce" size={24} />
          </div>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-none">
            Live Venue <br /><span className="text-pink-500">Simulation</span>
          </h1>
          <p className="text-slate-400 text-sm font-bold tracking-widest uppercase opacity-80">
            お手持ちのスマホでスキャンしてください
          </p>
        </div>

        {/* ✅ さっきまで使っていた本物のQRコードを表示 */}
        <div className="relative group">
          <div className="absolute inset-0 bg-pink-500/20 blur-2xl group-hover:bg-pink-500/40 transition-all duration-500" />
          <div className="relative bg-white p-4 rounded-[2.5rem] shadow-2xl mx-auto w-64 h-64 flex flex-col items-center justify-center border-4 border-slate-900 overflow-hidden">
            {qrUrl ? (
              // 読めるQRコード画像
              <img src={qrUrl} alt="QR Code to Support" className="w-full h-full object-contain p-2" />
            ) : (
              // 読み込み中のプレースホルダー
              <div className="w-full h-full bg-slate-100 animate-pulse rounded-2xl" />
            )}
          </div>
          <div className="absolute -bottom-4 -right-4 bg-pink-500 p-4 rounded-2xl shadow-xl border-4 border-slate-950 text-white animate-bounce">
            <Smartphone size={24} />
          </div>
        </div>

        <div className="space-y-6 px-4">
          <div className="flex items-center justify-center gap-4 text-slate-500">
            <div className="h-px w-12 bg-slate-800" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Or Click below</span>
            <div className="h-px w-12 bg-slate-800" />
          </div>

          <Link 
            href="/demo/cheers"
            className="group block w-full bg-slate-900 border border-slate-700 text-white p-6 rounded-[2rem] font-black text-xl hover:bg-white hover:text-slate-950 hover:border-white transition-all shadow-2xl relative overflow-hidden active:scale-95"
          >
            <div className="relative z-10 flex items-center justify-center gap-3 italic uppercase tracking-tighter">
              <span>応援ページへ進む</span>
              <ArrowRight className="group-hover:translate-x-2 transition-transform" />
            </div>
          </Link>

          <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
            ※実際の看板ではQRコードのみ配置されます。
          </p>
        </div>
      </div>
    </div>
  );
}