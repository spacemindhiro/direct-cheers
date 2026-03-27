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
      {/* 背景演出 */}
      <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-pink-500/10 blur-[120px] rounded-full" />
      
      <div className="max-w-md w-full space-y-8 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* 成功メッセージ */}
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-4">
            <div className="bg-pink-500/20 p-3 rounded-full">
              <CheckCircle2 size={48} className="text-pink-500" />
            </div>
          </div>
          <h1 className="text-3xl font-black italic tracking-tighter uppercase leading-none">
            Success!
          </h1>
          <p className="text-slate-400 text-xs font-bold tracking-[0.2em] uppercase">
            Your Cheers has been delivered.
          </p>
        </div>

        {/* ✅ Cheers! カード (シリアルナンバー & Thanks! 入り) */}
        <div className="relative group">
          {/* カード背後のグロー */}
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 to-indigo-500/20 blur-2xl opacity-50" />
          
          <div className="relative bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
            {/* カード上部：ステータスバー */}
            <div className="bg-pink-500 px-6 py-2 flex justify-between items-center">
              <span className="text-[10px] font-black tracking-widest uppercase">Verified Support</span>
              <span className="text-[10px] font-mono font-bold">{serialNumber}</span>
            </div>

            <div className="p-8 space-y-8">
              {/* メインタイトル */}
              <div className="space-y-1">
                <p className="text-pink-500 text-[10px] font-black tracking-[0.4em] uppercase">Digital Certificate</p>
                <h2 className="text-4xl font-black italic tracking-tighter uppercase leading-none">
                  Cheers! <br />
                  <span className="text-white opacity-40 text-2xl">Thanks!</span> {/* ✅ Thanks! を追加 */}
                </h2>
              </div>

              {/* アーティスト・イベント情報 */}
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-start gap-4">
                  <div className="bg-slate-800 p-3 rounded-2xl">
                    <Music size={20} className="text-pink-500" />
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Artist</p>
                    <p className="text-lg font-black italic uppercase leading-none">{artistName}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="bg-slate-800 p-3 rounded-2xl">
                    <Ticket size={20} className="text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Event</p>
                    <p className="text-sm font-bold uppercase text-slate-300">{eventName}</p>
                  </div>
                </div>
              </div>

              {/* ✅ カード下部のシリアルナンバー（刻印風） */}
              <div className="pt-6 flex justify-between items-end border-t border-slate-800/50">
                <div className="space-y-1">
                  <p className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">Serial Number</p>
                  <p className="text-xs font-mono text-slate-400">{serialNumber}</p>
                </div>
                <div className="text-right">
                  <div className="inline-block bg-white text-slate-950 text-[9px] font-black px-2 py-1 rounded uppercase tracking-tighter shadow-lg">
                    Original Proof
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* アクションボタン */}
        <div className="grid grid-cols-2 gap-4">
          <button className="flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 p-4 rounded-2xl font-bold text-xs hover:bg-slate-800 transition-all uppercase tracking-widest">
            <Share2 size={16} /> Share
          </button>
          <button className="flex items-center justify-center gap-2 bg-white text-slate-950 p-4 rounded-2xl font-bold text-xs hover:bg-pink-50 transition-all uppercase tracking-widest shadow-xl shadow-pink-500/10">
            <Download size={16} /> Save Image
          </button>
        </div>

        <Link 
          href="/demo"
          className="flex items-center justify-center gap-2 w-full p-4 text-slate-500 hover:text-white transition-all text-xs font-bold uppercase tracking-[0.3em]"
        >
          <Home size={16} /> Back to Demo Top
        </Link>
      </div>
    </div>
  );
}