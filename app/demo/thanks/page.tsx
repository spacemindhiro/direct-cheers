'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Wallet, ArrowRight, Sparkles, Smartphone, Download } from "lucide-react";

export default function ThanksPage() {
  const [os, setOs] = useState<'ios' | 'android' | 'pc'>('pc');
  const serialNumber = "#001-20260326"; // ✅ シリアルNo

  // OS判定
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setOs('ios');
    } else if (/android/.test(ua)) {
      setOs('android');
    }
  }, []);

  const handleAddToWallet = () => {
    if (os === 'ios') {
      alert(`Apple Wallet用のパス (${serialNumber}) を発行します。iPhoneの標準機能で追加画面が開きます。`);
    } else if (os === 'android') {
      alert(`Google Walletに追加するためのリンク (${serialNumber}) を発行します。`);
    } else {
      alert("PC環境です。スマホでQRコードを読み取って追加してください。");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-500/10 blur-[120px] rounded-full animate-pulse" />
      </div>

      <main className="max-w-4xl mx-auto pt-20 pb-32 px-6 relative z-10 text-center">
        <div className="mb-12 flex flex-col items-center">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/50 mb-6 animate-bounce">
            <CheckCircle2 className="text-green-400" size={40} />
          </div>
          <span className="text-pink-500 font-black italic tracking-[0.4em] text-xs uppercase mb-4">Payment Completed</span>
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter italic uppercase leading-[1.1]">
            Cheers! <br />
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">Successfully Sent.</span>
          </h1>
        </div>

        {/* Digital Asset Card */}
        <div className="mb-16">
          <div className="relative inline-block group perspective-1000">
            <div className="absolute inset-0 bg-gradient-to-tr from-pink-500/20 to-indigo-500/20 blur-2xl group-hover:scale-110 transition-transform" />
            <div className="relative bg-slate-900 border border-slate-700 w-72 md:w-80 aspect-[2/3] rounded-[2rem] overflow-hidden shadow-2xl transition-transform duration-700 group-hover:rotate-y-12">
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-60 grayscale hover:grayscale-0 transition-all duration-700" />
              
              {/* ✅ カード右上にシリアルNoを配置 */}
              <div className="absolute top-6 right-8 text-right">
                <p className="text-[10px] font-mono font-bold text-white/50 tracking-widest">{serialNumber}</p>
              </div>

              <div className="absolute bottom-8 left-8 right-8 text-left">
                {/* ✅ Thanks! を追加 */}
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-pink-500 font-black text-[10px] tracking-widest uppercase block">Exclusive Asset</span>
                  <span className="bg-white text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter shadow-lg">Thanks!</span>
                </div>
                
                <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter leading-none mb-1">Night Streamer</h3>
                <p className="text-slate-400 text-[10px] font-medium uppercase tracking-[0.2em]">SpaceMind | 2026.03.26</p>
              </div>
            </div>
            <Sparkles className="absolute -top-4 -right-4 text-yellow-400 animate-pulse" size={32} />
          </div>
        </div>

        {/* Action Area (実績そのまま) */}
        <div className="grid gap-4 max-w-sm mx-auto">
          {(os === 'ios' || os === 'pc') && (
            <button 
              onClick={handleAddToWallet}
              className="flex items-center justify-center gap-3 bg-white text-slate-950 h-16 rounded-2xl font-black text-lg hover:bg-pink-500 hover:text-white transition-all shadow-xl group active:scale-95"
            >
              <Wallet size={20} fill="currentColor" /> Add to Apple Wallet
              <ArrowRight className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" size={20} />
            </button>
          )}

          {(os === 'android' || os === 'pc') && (
            <button 
              onClick={handleAddToWallet}
              className="flex items-center justify-center gap-3 bg-slate-900 text-white border border-slate-700 h-16 rounded-2xl font-black text-lg hover:bg-slate-800 transition-all shadow-xl group active:scale-95"
            >
              <Smartphone size={20} className="text-green-500" /> Add to Google Wallet
              <ArrowRight className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" size={20} />
            </button>
          )}

          <button className="flex items-center justify-center gap-2 text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest py-4 transition-colors">
            <Download size={16} /> Save as Image
          </button>

          <Link href="/demo" className="text-slate-600 hover:text-pink-500 transition-colors text-xs font-bold uppercase tracking-widest mt-8">
            Back to Demo Top
          </Link>
        </div>
      </main>
    </div>
  );
}