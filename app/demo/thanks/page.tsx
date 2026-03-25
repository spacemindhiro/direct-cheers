import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Wallet, Share2, ArrowRight, Download, Sparkles } from "lucide-react";

export default function ThanksPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      {/* --- Background Effect --- */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-500/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full animate-pulse delay-700" />
      </div>

      <main className="max-w-4xl mx-auto pt-20 pb-32 px-6 relative z-10 text-center">
        {/* --- Success Icon & Message --- */}
        <div className="mb-12 flex flex-col items-center">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/50 mb-6 animate-bounce">
            <CheckCircle2 className="text-green-400" size={40} />
          </div>
          <span className="text-pink-500 font-black italic tracking-[0.4em] text-xs uppercase mb-4">Payment Completed</span>
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter italic uppercase leading-[1.1]">
            Cheers! <br />
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              Successfully Sent.
            </span>
          </h1>
          <p className="mt-8 text-slate-400 text-lg font-medium max-w-lg mx-auto leading-relaxed">
            あなたの熱い応援は、リアルタイムでアーティストの元へ届けられました。<br />
            そして今、この瞬間の「証」があなたのものになります。
          </p>
        </div>

        {/* --- Digital Card Preview (The Prize) --- */}
        <div className="mb-20">
          <div className="relative inline-block group">
            {/* Card Glow Background */}
            <div className="absolute inset-0 bg-gradient-to-tr from-pink-500/20 to-indigo-500/20 blur-2xl group-hover:scale-110 transition-transform duration-700" />
            
            {/* The Actual Card UI */}
            <div className="relative bg-slate-900 border border-slate-700 w-72 md:w-80 aspect-[2/3] rounded-[2rem] overflow-hidden shadow-2xl transition-transform duration-500 group-hover:-rotate-2 group-hover:scale-[1.02]">
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-60" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
              
              <div className="absolute top-6 left-6 right-6 flex justify-between items-start">
                <img src="/logo-emblem.png" alt="Logo" className="w-8 h-8 rounded-lg brightness-110" />
                <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/20">
                  <span className="text-[10px] font-black text-white italic tracking-widest">NO. 00039</span>
                </div>
              </div>

              <div className="absolute bottom-8 left-8 right-8 text-left">
                <span className="text-pink-500 font-black text-[10px] tracking-widest uppercase mb-2 block">Exclusive Asset</span>
                <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter leading-none mb-1">Night Streamer</h3>
                <p className="text-slate-400 text-[10px] font-medium uppercase tracking-[0.2em]">Tokyo Garden Theater | 2026.03.26</p>
              </div>
            </div>

            {/* Floating Sparkles Icons */}
            <Sparkles className="absolute -top-4 -right-4 text-yellow-400 animate-pulse" size={32} />
          </div>
        </div>

        {/* --- Actions --- */}
        <div className="grid gap-4 max-w-sm mx-auto">
          <button className="flex items-center justify-center gap-3 bg-white text-slate-950 h-16 rounded-2xl font-black text-lg hover:bg-pink-500 hover:text-white transition-all shadow-xl shadow-white/5 group">
            <Wallet size={20} fill="currentColor" />
            Add to Apple Wallet
            <ArrowRight className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" size={20} />
          </button>
          
          <button className="flex items-center justify-center gap-3 bg-slate-900 text-slate-200 h-16 rounded-2xl font-bold border border-slate-800 hover:bg-slate-800 transition-colors">
            <Download size={20} />
            Save as Image
          </button>

          <div className="mt-8 flex items-center justify-center gap-6">
            <button className="text-slate-500 hover:text-white transition-colors flex items-center gap-2 text-sm font-bold uppercase tracking-widest">
              <Share2 size={16} /> Share on X
            </button>
            <div className="w-1 h-1 bg-slate-800 rounded-full" />
            <Link href="/" className="text-slate-500 hover:text-pink-500 transition-colors text-sm font-bold uppercase tracking-widest">
              Back to Top
            </Link>
          </div>
        </div>
      </main>

      {/* --- Simple Footer --- */}
      <footer className="py-10 text-center border-t border-slate-900">
        <p className="text-slate-700 text-[10px] font-mono italic tracking-widest uppercase">
          Transaction verified on the blockchain. 0x71C...3F2E
        </p>
      </footer>
    </div>
  );
}