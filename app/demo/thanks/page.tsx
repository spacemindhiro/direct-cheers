'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Wallet, ArrowRight, Sparkles, X, Smartphone, Info, Fingerprint } from "lucide-react";

function ThanksContent() {
  const searchParams = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  
  // ⚡️ APIを叩くのをやめ、URLに渡ってきた値をそのまま信じる
  const rawEmail = searchParams.get('email');
  const userEmail = (!rawEmail || rawEmail.includes('{')) 
    ? "spacemind.fan@example.com" // 置換失敗時のフォールバック
    : rawEmail;

  const serialNumber = "#001-20260326";

  return (
    <main className="max-w-4xl mx-auto pt-20 pb-32 px-6 relative z-10 text-center">
      <div className="mb-12 flex flex-col items-center">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/50 mb-6 animate-pulse">
          <CheckCircle2 className="text-green-400" size={40} />
        </div>
        <span className="text-pink-500 font-black italic tracking-[0.4em] text-xs uppercase mb-4">Payment Completed</span>
        <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter italic uppercase leading-[1.1]">
          Cheers! <br />
          <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">Access Granted.</span>
        </h1>

        <div className="mt-6 px-4 py-2 bg-white/5 border border-white/10 rounded-full inline-flex items-center gap-2 backdrop-blur-md">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Registered ID:</span>
          <span className="text-sm font-mono text-pink-400">{userEmail}</span>
        </div>
      </div>

      {/* 💳 完全復活：デジタルカード（ホバー演出込み） */}
      <div className="mb-16">
        <div className="relative inline-block group perspective-1000">
          <div className="absolute inset-0 bg-gradient-to-tr from-pink-500/20 to-indigo-500/20 blur-2xl transition-transform duration-700" />
          <div className="relative bg-slate-900 border border-slate-700 w-72 md:w-80 aspect-[2/3] rounded-[2rem] overflow-hidden shadow-2xl transition-all duration-500 group-hover:scale-[1.02] group-hover:rotate-1">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-60 grayscale group-hover:grayscale-0 transition-all duration-700" />
            <div className="absolute top-6 right-8 text-right">
              <p className="text-[10px] font-mono font-bold text-white/50 tracking-widest">{serialNumber}</p>
            </div>
            <div className="absolute bottom-8 left-8 right-8 text-left">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-pink-500 font-black text-[10px] tracking-widest uppercase block">Exclusive Asset</span>
              </div>
              <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter leading-none mb-1">Night Streamer</h3>
              <p className="text-slate-400 text-[10px] font-medium uppercase tracking-[0.2em]">SpaceMind | 2026.03.26</p>
            </div>
          </div>
          <Sparkles className="absolute -top-4 -right-4 text-yellow-400 animate-pulse" size={32} />
        </div>
      </div>

      <div className="grid gap-4 max-w-sm mx-auto">
        {!isRegistered ? (
          <button 
            onClick={() => setIsRegistered(true)}
            className="flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white h-16 rounded-2xl font-black text-lg hover:from-pink-500 hover:to-orange-500 transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)] group active:scale-95"
          >
            <Fingerprint size={24} className="animate-pulse" /> 顔パスを有効化
            <ArrowRight className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" size={20} />
          </button>
        ) : (
          <div className="bg-green-500/10 border border-green-500/30 h-16 rounded-2xl flex items-center justify-center gap-3 text-green-400 font-black text-lg">
            <CheckCircle2 size={24} /> 生体認証 登録済み
          </div>
        )}

        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center justify-center gap-3 bg-white text-slate-950 h-16 rounded-2xl font-black text-lg hover:bg-slate-200 transition-all shadow-xl group active:scale-95"
        >
          <Wallet size={20} fill="currentColor" /> Add to Wallet
        </button>

        <Link href="/demo" className="text-slate-500 hover:text-pink-500 transition-colors text-xs font-bold uppercase tracking-widest mt-8">
          Back to Demo Top
        </Link>
      </div>

      {/* モーダル部分 */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl text-left">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-[2.5rem] p-8 relative shadow-2xl">
            <button onClick={() => setShowModal(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white"><X size={24} /></button>
            <div className="mb-6 inline-flex p-3 bg-pink-500/10 rounded-2xl"><Smartphone className="text-pink-500" size={24} /></div>
            <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-4 text-left">Wallet Integration</h2>
            <p className="text-sm text-slate-400 mb-8 leading-relaxed">
              決済完了と同時にApple Wallet / Google Wallet用のパスファイルを生成。スマホ決済時のメアドがそのまま証明書に刻印されます。
            </p>
            <button onClick={() => setShowModal(false)} className="w-full bg-slate-200 text-slate-950 h-14 rounded-2xl font-black uppercase text-xs">Close</button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function ThanksPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-500/10 blur-[120px] rounded-full" />
      </div>
      <Suspense fallback={<div className="pt-40 text-center font-black text-slate-500 tracking-[0.5em]">LOADING...</div>}>
        <ThanksContent />
      </Suspense>
    </div>
  );
}