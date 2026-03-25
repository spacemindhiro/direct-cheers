'use client';

import React from 'react';
import Link from 'next/link';
import { Zap, Flame, Wallet, ArrowLeft } from "lucide-react";

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
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
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 tracking-widest uppercase bg-slate-900 px-4 py-2 rounded-full border border-slate-800">
            <Zap className="text-pink-500" size={14} fill="currentColor" />
            LIVE DEMO MODE
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative py-20 px-6 overflow-hidden border-b border-slate-900 text-center">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?q=80&w=2074&auto=format&fit=crop')] bg-cover bg-center opacity-10" />
        <div className="max-w-4xl mx-auto relative z-10">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-pink-500 transition-colors mb-10">
            <ArrowLeft size={16} /> BACK TO TOP
          </Link>
          <h2 className="text-5xl md:text-7xl font-black mb-8 tracking-tighter text-white leading-tight uppercase italic">
            ライブを、<span className="bg-gradient-to-r from-pink-500 to-indigo-500 bg-clip-text text-transparent">ハックせよ</span>。
          </h2>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-24 bg-slate-950 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-12 items-start">
          
          {/* 1. 応援を送る (ここがメインの決済アクション) */}
          <div className="md:col-span-5 grid gap-8 order-2 md:order-1">
            <div className="p-10 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-pink-500/30 shadow-2xl relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-pink-500/10 blur-3xl" />
              <div className="flex items-center gap-4 mb-6 relative z-10">
                <div className="text-pink-500 font-black text-5xl italic opacity-50">01</div>
                <h4 className="text-3xl font-black text-white italic tracking-tighter uppercase">応援を送る</h4>
              </div>
              <p className="text-sm text-slate-400 mb-10 relative z-10 leading-relaxed font-medium">
                「100円で応援する」ボタンを押すと、Stripe決済画面へ移動します。<br />
                決済完了後、アーティストから特別なギフト（デジタルカード）が届きます。
              </p>
              
              {/* --- 💡 修正ポイント：決済ボタンをこちらへ移動 & APIへPOST --- */}
              <form action="/api/pay" method="POST">
                <button 
                  type="submit"
                  className="relative z-10 inline-flex items-center gap-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white px-10 py-6 rounded-2xl font-black text-xl hover:scale-[1.03] transition-all shadow-2xl shadow-pink-500/20 w-full justify-center group"
                >
                  <Flame className="group-hover:animate-bounce" size={24} fill="currentColor" />
                  100円で応援する
                </button>
              </form>
            </div>

            <div className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800 opacity-60">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-slate-700 font-black text-3xl italic">02</div>
                <h4 className="text-xl font-bold text-slate-500 italic tracking-tighter uppercase">絆の証を受け取る</h4>
              </div>
              <p className="text-xs text-slate-600 font-medium uppercase tracking-widest">
                ※決済完了後に自動で発行されます
              </p>
            </div>
          </div>

          {/* 2. Stage Simulator (Visual Feed) */}
          <div className="md:col-span-7 bg-slate-900/50 p-6 rounded-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden order-1 md:order-2">
            <div className="relative aspect-[16/10] rounded-2xl border border-slate-700 overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-40" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
              
              {/* Status Overlay */}
              <div className="absolute top-6 left-6 flex items-center gap-2 text-[10px] font-black tracking-widest uppercase bg-slate-950/80 px-4 py-2 rounded-full border border-slate-700 backdrop-blur-md">
                <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse" />
                Live: Tokyo Dome (Demo)
              </div>
            </div>
            <div className="mt-8 flex justify-between items-center px-4">
              <h3 className="text-xl font-bold text-white italic tracking-tight uppercase">Stage Visual Monitor</h3>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Feed ID: DC-9912</span>
            </div>
          </div>

        </div>
      </section>

      <footer className="py-20 text-center border-t border-slate-900 bg-slate-950">
        <p className="text-slate-700 text-[10px] font-mono italic tracking-[0.3em] uppercase">
          © 2026 Direct Cheers Platform. Digital Assets for Live Moments.
        </p>
      </footer>
    </div>
  );
}