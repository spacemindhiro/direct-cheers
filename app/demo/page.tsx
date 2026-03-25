import React from 'react';
import Link from 'next/link';
import { Play, Zap, Flame, Wallet, ArrowLeft, RotateCcw } from "lucide-react";

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      {/* --- Navigation (Landing Pageと統一) --- */}
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

      {/* --- Demo Hero Section --- */}
      <section className="relative py-20 px-6 overflow-hidden border-b border-slate-900">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?q=80&w=2074&auto=format&fit=crop')] bg-cover bg-center opacity-10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-transparent blur-[100px] rounded-full -z-10" />
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-pink-500 transition-colors mb-10">
            <ArrowLeft size={16} /> BACK TO TOP
          </Link>
          <h2 className="text-4xl md:text-6xl font-black mb-8 tracking-tighter text-white leading-tight uppercase italic">
            ステージを、<br />
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              その手でハックせよ
            </span>
            。
          </h2>
          <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed font-medium">
            これは、Direct Cheersの「リアルタイム演出連動」と「ウォレット発行」をブラウザ上で体験できるシミュレーターです。<br />
            スマホの応援がどう会場を変えるのか、体感してください。
          </p>
        </div>
      </section>

      {/* --- Simulator Core Section --- */}
      <section className="py-24 bg-slate-950 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-12 items-start">
          
          {/* 1. Live Stage Simulator (Visual Feed) */}
          <div className="md:col-span-7 bg-slate-900/50 p-6 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-slate-950 rounded-2xl border border-slate-700 aspect-[16/10] overflow-hidden">
              {/* --- ライブ会場背景 (シミュレーション用) --- */}
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-40 group-hover:scale-105 transition-transform duration-1000" />
              
              {/* --- 動的演出 (Cheers!量に応じて変化させるレイヤー) --- */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
              {/* 例：Cheers!量が多い時に点滅するピンクの光線 */}
              <div className="absolute inset-0 bg-pink-500/10 blur-xl opacity-0 animate-pulse group-hover:opacity-100 transition-opacity" />
              
              {/* --- 演出ステータス表示 --- */}
              <div className="absolute top-4 left-4 flex items-center gap-2 text-[10px] font-black tracking-widest uppercase bg-slate-950/80 px-3 py-1.5 rounded-full border border-slate-700 backdrop-blur-sm">
                <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-pulse" />
                Live Stage: Active
              </div>
              <div className="absolute top-4 right-4 text-[10px] font-black tracking-widest uppercase bg-slate-950/80 px-3 py-1.5 rounded-full border border-slate-700 backdrop-blur-sm">
                VENUE: TOKYO DOME (DEMO)
              </div>

              {/* --- Cheers!フィード表示 --- */}
              <div className="absolute bottom-4 left-4 right-4 h-24 bg-gradient-to-t from-black/60 to-transparent flex flex-col-reverse gap-2 p-2">
                <div className="text-white text-xs font-bold italic p-2 bg-pink-500/20 rounded-md border border-pink-500/30 animate-fade-in-up">#39 Cheers! from @User_A (Wait! Lighting change!)</div>
                <div className="text-slate-300 text-xs font-bold italic p-2 bg-slate-800/50 rounded-md border border-slate-700 animate-fade-in-up">#38 Cheers! from @User_B</div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-between items-center px-2">
              <h3 className="text-xl font-bold text-white italic">Stage Visual Simulator</h3>
              <p className="text-sm text-slate-500">演出のリアルタイム変化をここへフィードします。</p>
            </div>
          </div>

          {/* 2. Control Panel (応援 & 特典) */}
          <div className="md:col-span-5 grid gap-10">
            
            {/* --- 応援セクション (01) --- */}
            <div className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800 hover:border-pink-500/30 transition-all group block text-left">
              <div className="flex items-center gap-4 mb-6">
                <div className="text-pink-500 font-black text-5xl italic mb-1 opacity-50">01</div>
                <h4 className="text-2xl font-bold text-white italic tracking-tight">応援を贈る</h4>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed mb-10">
                下のボタンをタップして「Cheers!」を送信。ステージシミュレーター上の照明（ピンクの脈動）が反応します。<br />
                送った熱量が、会場の空気を変えていく感覚を体験してください。
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <button className="flex items-center justify-center gap-2.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white p-5 rounded-2xl font-bold hover:scale-105 transition-all shadow-xl shadow-pink-500/10">
                  <Flame className="text-white" size={20} fill="currentColor" />
                  Cheers! (x1)
                </button>
                <button className="flex items-center justify-center gap-2.5 bg-slate-900 text-slate-400 p-5 rounded-2xl font-bold hover:bg-slate-800 transition-colors border border-slate-800 hover:border-slate-700">
                  <RotateCcw className="text-slate-600" size={16} />
                  Reset Stage
                </button>
              </div>
            </div>

            {/* --- ウォレット特典セクション (02) --- */}
            <div className="p-10 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-violet-500/20 shadow-2xl relative overflow-hidden group block text-left">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-violet-500/10 blur-3xl group-hover:bg-violet-500/20 transition-all" />
              <div className="flex items-center gap-4 mb-6 relative z-10">
                <div className="text-violet-500 font-black text-5xl italic mb-1">02</div>
                <h4 className="text-2xl font-bold text-white italic tracking-tight">「絆の証」を受け取る</h4>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed mb-10 relative z-10">
                応援のお礼として、アーティストから「デジタルCheers!カード」が届きます。<br />
                下のボタンからテスト用カードを生成し、スマホのウォレット（Apple Wallet / Google Wallet）へ追加する体験をシミュレーションします。
              </p>
              
              <div className="relative z-10">
                <button className="inline-flex items-center gap-3 bg-white text-slate-950 px-10 py-4 rounded-full font-bold hover:bg-pink-500 hover:text-white transition-all shadow-2xl w-full justify-center">
                  <Wallet className="text-slate-950" size={20} fill="currentColor" />
                  デジタルカードを生成 (テスト)
                </button>
              </div>
            </div>
            
          </div>
        </div>
      </section>

      {/* --- Footer Area (Landing Pageと統一) --- */}
      <footer className="py-24 px-6 border-t border-slate-800 bg-slate-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-16">
          <div className="space-y-6">
            <h5 className="font-bold text-white tracking-tighter italic text-xl flex items-center gap-2">
              DIRECT CHEERS 
              <span className="text-[10px] bg-slate-900 px-3 py-1 rounded-full text-slate-600 font-mono tracking-widest border border-slate-800">DEMO</span>
            </h5>
            <p className="text-slate-500 text-[10px] max-w-xs leading-relaxed uppercase tracking-[0.3em]">
              Digital Assets for Live Moments.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-16 text-left">
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Navigation</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-medium">
                <li><Link href="/#concept" className="hover:text-pink-500 transition-colors">コンセプト</Link></li>
                <li><Link href="/#features" className="hover:text-pink-500 transition-colors">機能・体験</Link></li>
              </ul>
            </div>
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Demo Info</h6>
              <p className="text-slate-500 text-[11px] leading-relaxed max-w-xs">
                このページは体験用のシミュレーターです。実際のライブ会場やブロックチェーンとは連動していません。ウォレットカードの発行もテスト用となります。
              </p>
            </div>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto mt-24 pt-8 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-600 text-[10px] font-mono italic">© 2026 Direct Cheers Platform. Demo Experience.</p>
        </div>
      </footer>
    </div>
  );
}