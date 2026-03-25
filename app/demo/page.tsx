'use client';

import React from 'react';
import Link from 'next/link';
import { Zap, Flame, Wallet, ArrowLeft, Loader2 } from "lucide-react";

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      {/* --- Navigation --- */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <img 
              src="/logo-emblem.png" 
              alt="Direct Cheers Logo" 
              className="w-8 h-8 rounded-lg shadow-lg shadow-pink-500/10 group-hover:scale-110 transition-transform"
            />
            <h1 className="text-xl font-black tracking-tighter text-white uppercase italic">Direct Cheers</h1>
          </Link>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 tracking-widest uppercase bg-slate-900 px-4 py-2 rounded-full border border-slate-800">
            <Zap className="text-pink-500" size={14} fill="currentColor" />
            LIVE DEMO MODE
          </div>
        </div>
      </nav>

      {/* --- Hero --- */}
      <section className="relative py-20 px-6 overflow-hidden border-b border-slate-900 text-center">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?q=80&w=2074&auto=format&fit=crop')] bg-cover bg-center opacity-10" />
        <div className="max-w-4xl mx-auto relative z-10">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-pink-500 transition-colors mb-10">
            <ArrowLeft size={16} /> BACK TO TOP
          </Link>
          <h2 className="text-4xl md:text-6xl font-black mb-8 tracking-tighter text-white leading-tight uppercase italic">
            演出を、<span className="bg-gradient-to-r from-pink-500 to-indigo-500 bg-clip-text text-transparent">ハックせよ</span>。
          </h2>
        </div>
      </section>

      {/* --- Main Content --- */}
      <section className="py-24 bg-slate-950 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-12 items-start">
          
          {/* Stage Simulator (Visual) */}
          <div className="md:col-span-7 bg-slate-900/50 p-6 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-slate-950 rounded-2xl border border-slate-700 aspect-[16/10] overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-40 group-hover:scale-105 transition-transform duration-1000" />
              <div className="absolute inset-0 bg-pink-500/10 blur-xl opacity-0 animate-pulse group-hover:opacity-100" />
            </div>
            <h3 className="mt-6 text-xl font-bold text-white italic px-2">Stage Visual Simulator</h3>
          </div>

          {/* Interaction Area */}
          <div className="md:col-span-5 grid gap-10">
            
            {/* 1. Dummy Interaction */}
            <div className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800 transition-all hover:border-slate-700">
              <h4 className="text-2xl font-bold text-white italic mb-6 uppercase tracking-tighter">01 応援を送る</h4>
              <button className="flex items-center justify-center gap-2.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white p-5 rounded-2xl font-bold w-full hover:scale-[1.02] transition-transform">
                <Flame size={20} fill="currentColor" /> Cheers! (x1)
              </button>
            </div>

            {/* 2. REAL Stripe Payment Flow */}
            <div className="p-10 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-violet-500/20 shadow-2xl relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-violet-500/10 blur-3xl" />
              <h4 className="text-2xl font-bold text-white italic mb-6 relative z-10 uppercase tracking-tighter">02 絆の証を受け取る</h4>
              <p className="text-sm text-slate-400 mb-10 relative z-10 leading-relaxed">
                決済完了後、あなたのスマホのウォレットへ追加できる限定デジタルカードを発行します。
              </p>
              
              {/* --- 💡 修正ポイント：以前動いていた方式 (form action) --- */}
              <form action="/api/pay" method="POST">
                <button 
                  type="submit"
                  className="relative z-10 inline-flex items-center gap-3 bg-white text-slate-950 px-10 py-5 rounded-full font-black text-lg hover:bg-pink-500 hover:text-white transition-all shadow-2xl w-full justify-center group"
                >
                  <Wallet className="text-slate-950 group-hover:text-white" size={20} fill="currentColor" />
                  100円で応援する
                </button>
              </form>
            </div>

          </div>
        </div>
      </section>

      <footer className="py-20 text-center border-t border-slate-900">
        <p className="text-slate-600 text-[10px] font-mono italic tracking-widest uppercase">
          © 2026 Direct Cheers Platform.
        </p>
      </footer>
    </div>
  );
}