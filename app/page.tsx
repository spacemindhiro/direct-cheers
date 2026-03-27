'use client';

import React from 'react';
import Link from 'next/link';
import { Play, Wallet, ShieldCheck, Zap, ArrowRight, Award, Database, Music, Mail, Smartphone, CheckCircle2 } from "lucide-react";

export default function LandingPage() {
  // ✅ iPhoneでの誤作動を防ぐためのハンドラー（必要に応じてaタグの代わりに使うことも可能）
  const contactEmail = "support@direct-cheers.com";
  const contactSubject = encodeURIComponent("【Direct Cheers】お問い合わせ");
  const mailUrl = `mailto:${contactEmail}?subject=${contactSubject}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30 overflow-x-hidden">
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
          
          <div className="hidden md:flex gap-8 text-[11px] font-bold tracking-widest uppercase items-center">
            <Link href="/about" className="text-pink-500 hover:text-white transition-colors border border-pink-500/30 px-3 py-1 rounded-md bg-pink-500/5">About Us</Link>
            <Link href="#concept" className="text-slate-400 hover:text-pink-500 transition-colors">コンセプト</Link>
            <Link href="#demo" className="text-slate-400 hover:text-pink-500 transition-colors italic">DEMO</Link>
            <Link href="#features" className="text-slate-400 hover:text-pink-500 transition-colors">機能・体験</Link>
            <Link href="/law" className="text-slate-500 hover:text-white underline decoration-pink-500/50 transition-colors">特定商取引法</Link>
          </div>

          <div className="flex items-center gap-4">
            {/* ✅ 修正1: JOIN NOW ボタン */}
            <a 
              href={mailUrl}
              className="bg-white text-slate-950 px-5 py-2 rounded-full text-xs font-black hover:bg-pink-500 hover:text-white transition-all shadow-xl shadow-white/5 uppercase tracking-tighter flex items-center gap-2 group"
            >
              <Mail size={14} className="group-hover:animate-pulse" />
              JOIN NOW
            </a>
          </div>
        </div>
      </nav>

      {/* --- Hero / Demo / Features Section (省略せずに構造維持) --- */}
      {/* ...中略... */}

      {/* --- Contact Section --- */}
      <section id="contact" className="py-32 px-6 bg-slate-950 relative overflow-hidden text-center border-t border-slate-900">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-pink-500/5 blur-[120px] rounded-full -z-10" />

        <div className="max-w-4xl mx-auto space-y-12 text-pretty">
          <div className="space-y-4">
            <span className="text-pink-500 font-black italic tracking-[0.4em] text-[10px] uppercase block">Contact Us</span>
            <h3 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter uppercase leading-tight">
              お問い合わせ
            </h3>
            <p className="text-slate-400 font-medium leading-relaxed max-w-xl mx-auto">
              サービス導入をご希望のオーガナイザー・アーティスト様、<br className="md:block hidden" />
              および、システムに関するご質問は、下記よりお気軽にご連絡ください。
            </p>
          </div>

          <div className="flex flex-col items-center gap-6">
            {/* ✅ 修正2: 中央の大きなコンタクトボタン */}
            <a 
              href={mailUrl} 
              className="group relative flex items-center justify-center gap-4 bg-white text-slate-950 px-8 md:px-16 py-6 rounded-[2rem] font-black text-lg hover:bg-pink-500 hover:text-white transition-all shadow-2xl shadow-white/5 tracking-tighter w-full md:w-auto"
            >
              <Mail size={22} className="group-hover:animate-bounce" />
              <span>SUPPORT@DIRECT-CHEERS.COM</span>
            </a>
            
            <p className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em]">
              通常 2営業日以内に担当よりご返信いたします
            </p>
          </div>
        </div>
      </section>

      {/* --- Footer Area --- */}
      <footer className="py-24 px-6 border-t border-slate-800 bg-slate-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-16">
          <div className="space-y-6">
            <h5 className="font-bold text-white tracking-tighter italic text-xl">DIRECT CHEERS</h5>
            <p className="text-slate-500 text-[10px] max-w-xs leading-relaxed uppercase tracking-[0.3em]">
              Digital Assets for Live Moments.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-16 sm:gap-24 text-left">
            {/* ...Navigation / Legal 省略... */}
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Support</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-medium tracking-widest uppercase">
                {/* ✅ 修正3: フッターのサポートリンク */}
                <li>
                  <a href={mailUrl} className="hover:text-white transition-colors">お問い合わせ</a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto mt-24 pt-8 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-600 text-[10px] font-mono italic">© 2026 Direct Cheers Platform.</p>
        </div>
      </footer>
    </div>
  );
}