'use client';

import React from 'react';
import Link from 'next/link';
import { Smartphone, ArrowRight, QrCode, Zap, Music } from "lucide-react";

export default function DemoEntrancePage() {
  // 遷移先の固定パス
  const CHEERS_URL = "/demo/cheers";

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* 背景演出 */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-pink-500/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full" />

      <div className="max-w-md w-full text-center space-y-12 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
        
        <div className="space-y-4 px-4">
          <div className="flex justify-center gap-2 mb-2">
            <Music className="text-pink-500 animate-pulse" size={24} />
            <Zap className="text-yellow-400 animate-bounce" size={24} />
          </div>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-none text-pretty">
            Live Venue <br /><span className="text-pink-500">Simulation</span>
          </h1>
          <p className="text-slate-400 text-sm font-bold tracking-widest uppercase opacity-80">
            QRをスキャンして応援ページへ
          </p>
        </div>

        {/* ✅ 実績のある Lucide QrCode 表示 */}
        <div className="relative group">
          <div className="absolute inset-0 bg-pink-500/20 blur-2xl group-hover:bg-pink-500/40 transition-all duration-500" />
          <div className="relative bg-white p-8 rounded-[2.5rem] shadow-2xl mx-auto w-64 h-64 flex flex-col items-center justify-center border-4 border-slate-900">
            {/* 以前表示されていたアイコンをそのまま配置 */}
            <QrCode size={160} className="text-slate-900" strokeWidth={1.5} />
            <div className="mt-2 text-[10px] font-black text-slate-400 uppercase tracking-tighter">
              Scan to Support
            </div>
          </div>
          {/* スマホアイコンの演出 */}
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
            href={CHEERS_URL}
            className="group block w-full bg-slate-900 border border-slate-700 text-white p-6 rounded-[2rem] font-black text-xl hover:bg-white hover:text-slate-950 hover:border-white transition-all shadow-2xl relative overflow-hidden active:scale-95"
          >
            <div className="relative z-10 flex items-center justify-center gap-3 italic uppercase tracking-tighter">
              <span>応援ページを開く</span>
              <ArrowRight className="group-hover:translate-x-2 transition-transform" />
            </div>
          </Link>

          <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
            ※実際の現場ではQRから直接Cheersページへ遷移します。
          </p>
        </div>
      </div>
    </div>
  );
}