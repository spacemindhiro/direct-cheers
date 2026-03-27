'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Share2, Download, Home, Ticket, Music } from "lucide-react";

export default function ThanksPage() {
  const artistName = "NIGHT STREAMER";
  const eventName = "SPACEMIND 2026.03.26";
  const serialNumber = "#001-20260326"; // ✅ 固定のシリアルナンバー

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-start pt-12 px-6 pb-20 relative overflow-hidden font-sans">
      {/* 背景演出（以前表示されていた実績そのまま） */}
      <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-pink-500/10 blur-[120px] rounded-full" />
      
      <div className="max-w-md w-full space-y-10 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* 成功メッセージ */}
        <div className="text-center space-y-3 px-4">
          <div className="flex justify-center mb-4">
            <div className="bg-emerald-500/20 p-3 rounded-full border border-emerald-500/30">
              <CheckCircle2 size={48} className="text-emerald-500" />
            </div>
          </div>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-none text-pretty">
            Cheers! Sent.
          </h1>
          <p className="text-slate-400 text-sm font-bold tracking-[0.2em] uppercase opacity-90">
            Thank you for your support!
          </p>
        </div>

        {/* ✅ Cheers! カード (元画像復活・シリアル & Thanks追加) */}
        <div className="relative group mx-auto w-full aspect-[4/5]">
          {/* カード背後のグロー */}
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 to-indigo-500/20 blur-2xl opacity-60 group-hover:opacity-80 transition-opacity" />
          
          {/* ⚠️ ✅ これが以前表示されていた「元の画像」（抽象的なグラデーション背景） */}
          <div className="relative h-full w-full bg-slate-900 border border-slate-800 rounded-[3rem] overflow-hidden shadow-2xl transition-transform group-hover:scale-[1.01] p-10 flex flex-col justify-between">
            
            {/* 抽象的な背景グラデーション演出（SVG/CSS） */}
            <div className="absolute inset-0 opacity-40 pointer-events-none">
              <svg width="100%" height="100%" viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <radialGradient id="grad1" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                    <stop offset="0%" style={{stopColor:'rgb(236, 72, 153)', stopOpacity:0.3}} />
                    <stop offset="100%" style={{stopColor:'rgb(15, 23, 42)', stopOpacity:0}} />
                  </radialGradient>
                </defs>
                <rect width="400" height="500" fill="url(#grad1)" />
                <circle cx="100" cy="100" r="80" fill="#a5b4fc" opacity="0.1" />
                <circle cx="300" cy="400" r="120" fill="#fbcfe8" opacity="0.05" />
              </svg>
            </div>

            {/* カード上部：シリアルナンバー（刻印風） */}
            <div className="relative z-10 flex justify-end">
              <div className="bg-white/10 text-slate-400 font-mono text-[10px] px-3 py-1 rounded-full border border-white/5 tracking-wider">
                {serialNumber}
              </div>
            </div>

            {/* カード中央：メインタイトル & 感謝 */}
            <div className="relative z-10 space-y-2 text-center flex-1 flex flex-col items-center justify-center">
              <div className="space-y-1">
                <p className="text-pink-400 text-[11px] font-black tracking-[0.5em] uppercase">Digital Support Proof</p>
                <h2 className="text-6xl font-black italic tracking-tighter uppercase leading-none drop-shadow-lg">
                  Cheers!
                </h2>
              </div>
              
              {/* ✅ Thanks! メッセージを追加（元の構成を崩さずに刻印） */}
              <div className="inline-block bg-white text-slate-950 text-sm font-black italic uppercase px-3 py-1 rounded shadow-lg tracking-tight mt-1">
                Thanks!
              </div>
            </div>

            {/* カード下部：アーティスト・イベント情報（以前と同じ構成） */}
            <div className="relative z-10 space-y-6 pt-8 border-t border-slate-800/80">
              <div className="flex items-start gap-4">
                <div className="bg-slate-800 p-3 rounded-2xl">
                  <Music size={20} className="text-pink-500" />
                </div>
                <div className="flex-1">
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Artist</p>
                  <p className="text-xl font-black italic uppercase leading-none tracking-tight">{artistName}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="bg-slate-800 p-3 rounded-2xl">
                  <Ticket size={20} className="text-indigo-500" />
                </div>
                <div className="flex-1">
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Event Certified</p>
                  <p className="text-sm font-bold uppercase text-slate-300 leading-tight">{eventName}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* アクションボタン（実績そのまま） */}
        <div className="grid grid-cols-2 gap-5 px-2">
          <button className="flex items-center justify-center gap-3 bg-slate-900 border border-slate-800 p-5 rounded-2xl font-black text-xs hover:bg-slate-800 transition-all uppercase tracking-widest shadow-inner active:scale-95 disabled:opacity-50">
            <Share2 size={18} /> Share Proof
          </button>
          <button className="flex items-center justify-center gap-3 bg-white text-slate-950 p-5 rounded-2xl font-black text-xs hover:bg-pink-50 transition-all uppercase tracking-widest shadow-xl active:scale-95">
            <Download size={18} /> Save Image
          </button>
        </div>

        <Link 
          href="/demo"
          className="flex items-center justify-center gap-2.5 w-full p-5 text-slate-500 hover:text-white transition-all text-xs font-bold uppercase tracking-[0.3em] active:scale-95"
          onMouseEnter={() => console.log('Home Hover')} // 実績サンプルの模倣
        >
          <Home size={16} /> Back to Demo Top
        </Link>
      </div>
    </div>
  );
}