'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Wallet, ArrowRight, Sparkles, X, Smartphone, Info, Fingerprint, Loader2 } from "lucide-react";

function ThanksContent() {
  const searchParams = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId || sessionId.startsWith('{')) return;

    let retryCount = 0;
    const maxRetries = 3;

    const fetchEmail = async () => {
      try {
        const res = await fetch(`/api/get-session?session_id=${sessionId}`);
        const data = await res.json();
        
        if (data.email) {
          setUserEmail(data.email);
        } else if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(fetchEmail, 2000); // StripeのDB反映待ちで2秒置く
        } else {
          setUserEmail("verification@example.com");
        }
      } catch (e) {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(fetchEmail, 2000);
        }
      }
    };

    fetchEmail();
  }, [searchParams]);

  return (
    <main className="max-w-4xl mx-auto pt-20 pb-32 px-6 relative z-10 text-center">
      {/* ヒーローヘッダー */}
      <div className="mb-12 flex flex-col items-center">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/50 mb-6 shadow-[0_0_40px_rgba(34,197,94,0.3)] animate-in fade-in zoom-in duration-700">
          <CheckCircle2 className="text-green-400" size={40} />
        </div>
        <span className="text-pink-500 font-black italic tracking-[0.4em] text-[10px] uppercase mb-4">Payment Completed</span>
        <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter italic uppercase leading-[1.1]">
          Cheers! <br />
          <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent italic">Access Granted.</span>
        </h1>

        <div className="mt-8 px-6 py-3 bg-white/5 border border-white/10 rounded-full inline-flex items-center gap-3 backdrop-blur-xl border-pink-500/20 shadow-xl">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Registered ID</span>
          <span className="text-sm font-mono text-pink-400 min-w-[140px]">
            {userEmail ? userEmail : (
              <span className="flex items-center gap-2 opacity-50 italic">
                <Loader2 size={12} className="animate-spin" /> Synchronizing...
              </span>
            )}
          </span>
        </div>
      </div>

      {/* 💳 デジタルカード（完全復旧版） */}
      <div className="mb-16">
        <div className="relative inline-block group perspective-1000">
          <div className="absolute inset-0 bg-gradient-to-tr from-pink-500/30 to-indigo-500/30 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
          <div className="relative bg-slate-900 border border-slate-700 w-72 md:w-80 aspect-[2/3] rounded-[2.5rem] overflow-hidden shadow-2xl transition-all duration-700 group-hover:scale-[1.02] group-hover:rotate-1">
            {/* 背景画像 */}
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-60 grayscale group-hover:grayscale-0 transition-all duration-1000" />
            
            <div className="absolute top-8 right-8 text-right">
              <p className="text-[10px] font-mono font-bold text-white/40 tracking-widest">#001-20260403</p>
            </div>
            
            <div className="absolute bottom-10 left-8 right-8 text-left">
              <span className="text-pink-500 font-black text-[10px] tracking-[0.3em] uppercase block mb-2">Exclusive Asset</span>
              <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter leading-none mb-1">Night Streamer</h3>
              <p className="text-slate-400 text-[10px] font-medium uppercase tracking-[0.2em]">SpaceMind | 2026.04.03</p>
            </div>
          </div>
          <Sparkles className="absolute -top-4 -right-4 text-yellow-400 animate-bounce" size={32} />
        </div>
      </div>

      {/* アクションボタン */}
      <div className="grid gap-4 max-w-sm mx-auto">
        <button 
          onClick={() => setIsRegistered(!isRegistered)} 
          className={`flex items-center justify-center gap-3 h-16 rounded-2xl font-black text-lg transition-all active:scale-95 ${isRegistered ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-[0_0_30px_rgba(168,85,247,0.4)] hover:brightness-110'}`}
        >
          {isRegistered ? <CheckCircle2 size={24} /> : <Fingerprint size={24} />}
          {isRegistered ? '生体認証 登録済み' : '顔パスを有効化'}
          {!isRegistered && <ArrowRight size={20} className="ml-1" />}
        </button>

        <button 
          onClick={() => setShowModal(true)} 
          className="flex items-center justify-center gap-3 bg-white text-slate-950 h-16 rounded-2xl font-black text-lg hover:bg-slate-100 transition-all shadow-xl active:scale-95"
        >
          <Wallet size={20} fill="currentColor" /> Add to Wallet
        </button>

        <Link href="/demo" className="text-slate-500 hover:text-pink-500 transition-colors text-[10px] font-black uppercase tracking-[0.3em] mt-10 block">
          Back to Demo Top
        </Link>
      </div>

      {/* ウォレット詳細モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-[3rem] p-10 relative shadow-2xl text-left border-white/5">
            <button onClick={() => setShowModal(false)} className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors">
              <X size={24} />
            </button>
            <div className="mb-6 inline-flex p-4 bg-pink-500/10 rounded-2xl border border-pink-500/20">
              <Smartphone className="text-pink-500" size={28} />
            </div>
            <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-4">Wallet Integration</h2>
            <div className="space-y-4 text-slate-400 text-sm font-medium leading-relaxed mb-10">
              <p>取得したメールアドレスを所有者IDとしてWalletパスに自動刻印。シームレスなファン体験を技術的に検証します。</p>
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 flex gap-3 italic text-[11px]">
                <Info size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                オフライン環境でもサポート実績を確認可能なデジタル会員証を即時発行します。
              </div>
            </div>
            <button onClick={() => setShowModal(false)} className="w-full bg-white text-slate-950 h-14 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-pink-500 hover:text-white transition-all shadow-lg active:scale-95">
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function ThanksPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      {/* 背景光エフェクト */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-pink-500/10 blur-[120px] rounded-full opacity-60" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[100px] rounded-full opacity-40" />
      </div>

      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="animate-spin text-pink-500 mx-auto mb-4" size={40} />
            <p className="text-slate-600 font-black uppercase tracking-[0.4em] text-xs">Finalizing Access...</p>
          </div>
        </div>
      }>
        <ThanksContent />
      </Suspense>
    </div>
  );
}