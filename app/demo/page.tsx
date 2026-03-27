'use client';

import React from 'react';
import Link from 'next/link';
import { Zap, Flame, ArrowLeft, QrCode, Smartphone, Monitor } from "lucide-react";

export default function DemoPage() {
  // ✅ 自分のドメイン。本番URLが決まればここを差し替えます。
  const demoUrl = "https://direct-cheers.com/demo"; 

  // ✅ QR生成APIを、よりパラメータが単純で安定しているものに変更
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(demoUrl)}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <img 
              src="/logo-emblem.png" 
              alt="Direct Cheers Logo" 
              className="w-8 h-8 rounded-lg shadow-lg shadow-pink-500/10 group-hover:scale-110 transition-transform"
            />
            <h1 className="text-xl font-black tracking-tighter text-white uppercase italic text-2xl">Direct Cheers</h1>
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 tracking-[0.2em] uppercase bg-slate-900 px-4 py-2 rounded-full border border-slate-800 shadow-inner">
            <Zap className="text-pink-500" size={14} fill="currentColor" />
            LIVE DEMO MODE
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative py-16 px-6 overflow-hidden border-b border-slate-900 text-center">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?q=80&w=2074&auto=format&fit=crop')] bg-cover bg-center opacity-10" />
        <div className="max-w-4xl mx-auto relative z-10">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-pink-500 transition-colors mb-8 uppercase tracking-widest">
            <ArrowLeft size={16} /> BACK TO TOP
          </Link>
          <h2 className="text-5xl md:text-7xl font-black mb-4 tracking-tighter text-white leading-tight uppercase italic">
            ライブを、<span className="bg-gradient-to-r from-pink-500 to-indigo-500 bg-clip-text text-transparent">ハックせよ</span>。
          </h2>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-20 bg-slate-950 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-12 items-start">
          
          {/* --- LEFT SIDE: Action Panel --- */}
          <div className="md:col-span-5 grid gap-8 order-2 md:order-1">
            
            {/* ✅ PC/Tablet View (Visible only on md screens and up) */}
            <div className="hidden md:block p-10 rounded-[3rem] bg-white text-slate-950 shadow-2xl relative overflow-hidden group border-4 border-slate-900">
              <div className="flex items-center gap-3 mb-6">
                <QrCode className="text-pink-600" size={28} />
                <h4 className="text-2xl font-black italic tracking-tighter uppercase">スマホでチェック</h4>
              </div>
              <p className="text-xs font-bold text-slate-500 mb-8 leading-relaxed uppercase tracking-wider">
                現場では、フライヤーやスクリーンのQRから決済ページへ。
              </p>
              
              {/* QR Image Wrapper */}
              <div className="bg-slate-100 p-6 rounded-3xl mb-8 flex items-center justify-center min-h-[240px]">
                {/* シンプルな<img>タグで表示 */}
                <img 
                  src={qrImageUrl} 
                  alt="Demo QR Code" 
                  className="w-48 h-48 block"
                />
              </div>
              <div className="text-[10px] font-mono text-center text-slate-400 uppercase tracking-widest">
                Scan to Experience Mobile Flow
              </div>
            </div>

            {/* ✅ Mobile / Direct Action (Always Visible) */}
            <div className="p-10 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-pink-500/30 shadow-2xl relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-pink-500/10 blur-3xl" />
              <div className="flex items-center gap-4 mb-6 relative z-10">
                <Smartphone className="text-pink-500 md:hidden" size={24} />
                <Monitor className="text-pink-500 hidden md:block" size={24} />
                <h4 className="text-2xl font-black text-white italic tracking-tighter uppercase">即座に応援を送る</h4>
              </div>
              <p className="text-sm text-slate-400 mb-8 relative z-10 leading-relaxed font-medium">
                ブラウザから直接決済。100円の決済完了後、デジタルギフトが即時発行されます。
              </p>
              
              <form action="/api/pay" method="POST">
                <button 
                  type="submit"
                  className="relative z-10 inline-flex items-center gap-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white px-10 py-6 rounded-2xl font-black text-xl hover:scale-[1.03] active:scale-95 transition-all shadow-2xl shadow-pink-500/20 w-full justify-center group"
                >
                  <Flame className="group-hover:animate-bounce" size={24} fill="currentColor" />
                  100円で応援する
                </button>
              </form>
            </div>
          </div>

          {/* --- RIGHT SIDE: Simulator --- */}
          <div className="md:col-span-7 bg-slate-900/50 p-6 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden order-1 md:order-2">
            <div className="relative aspect-[16/10] rounded-2xl border border-slate-700 overflow-hidden shadow-inner">
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-40" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
              <div className="absolute top-6 left-6 flex items-center gap-2 text-[10px] font-black tracking-[0.2em] uppercase bg-slate-950/80 px-4 py-2 rounded-full border border-slate-800 backdrop-blur-md shadow-xl">
                <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(236,72,153,0.8)]" />
                Live: SpaceMind (Demo)
              </div>
            </div>
          </div>

        </div>
      </section>

      <footer className="py-20 text-center border-t border-slate-900 bg-slate-950">
        <p className="text-slate-700 text-[10px] font-mono italic tracking-[0.4em] uppercase">
          © 2026 Direct Cheers Platform.
        </p>
      </footer>
    </div>
  );
}