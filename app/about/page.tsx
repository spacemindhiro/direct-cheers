'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, Target, Mail, MapPin, Zap } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      {/* --- Background Effect --- */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-500/10 blur-[120px] rounded-full opacity-60" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full opacity-60" />
      </div>

      {/* --- Navigation (Landing Pageと統一) --- */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <img 
              src="/logo-emblem.png" 
              alt="Direct Cheers Logo" 
              className="w-9 h-9 rounded-lg shadow-lg shadow-pink-500/10 group-hover:scale-110 transition-transform"
            />
            <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic">Direct Cheers</h1>
          </Link>
          <div className="flex items-center gap-4 text-xs font-bold text-slate-500 tracking-widest uppercase bg-slate-900 px-5 py-2.5 rounded-full border border-slate-800">
            <Zap className="text-pink-500" size={16} fill="currentColor" />
            Platform Info
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-20 px-6 relative z-10">
        {/* --- Back to Top --- */}
        <div className="mb-16">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-pink-500 transition-colors uppercase tracking-widest">
            <ArrowLeft size={16} /> BACK TO TOP
          </Link>
        </div>

        {/* --- Hero Section --- */}
        <section className="text-center mb-32 relative py-16">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-br from-pink-500/15 via-indigo-500/10 to-transparent blur-[100px] rounded-full -z-10" />
          <span className="text-pink-500 font-black italic tracking-[0.4em] text-xs uppercase mb-6 block animate-fade-in">ABOUT THE PLATFORM</span>
          <h2 className="text-5xl md:text-7xl font-black mb-10 tracking-tighter text-white leading-[1.1] uppercase italic animate-fade-in-up">
            ライブ体験を、<br />
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">永遠のアセットに。</span>
          </h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium animate-fade-in-up delay-100">
            Direct Cheersは、アーティストとファンの熱狂をデジタル技術で記録し、共有可能な資産へと昇華させる新しいプラットフォームです。<br />
            一過性の熱狂ではなく、絆の記録として、永遠に。
          </p>
        </div>

        {/* --- Mission Section --- */}
        <section className="grid md:grid-cols-2 gap-12 mb-32 items-center">
          <div className="p-12 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-2xl relative overflow-hidden group">
            <div className="absolute -right-6 -top-6 w-40 h-40 bg-pink-500/10 blur-3xl group-hover:scale-110 transition-transform duration-500" />
            <div className="flex items-center gap-5 mb-8 relative z-10">
              <div className="w-14 h-14 bg-pink-500/10 rounded-2xl flex items-center justify-center border border-pink-500/20 shadow-lg shadow-pink-500/5">
                <Target className="text-pink-400" size={30} />
              </div>
              <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">PLATFORM MISSION</h3>
            </div>
            <div className="space-y-6 text-slate-400 font-medium leading-relaxed relative z-10">
              <p>一瞬のライブ体験が持つ、あの熱量を永遠の記録（アセット）として残すこと。</p>
              <p>ファンからアーティストへの直接的な「Cheers!（応援）」を、最速かつ安全に届けること。</p>
              <p>デジタル証明技術（NFT）を活用し、ファンの「応援の履歴」を所有・証明可能な資産へと変えること。</p>
              <p>これらのミッションを通じて、持続可能なエンターテインメント・エコシステムの構築を目指します。</p>
            </div>
          </div>
          <div className="space-y-6 text-center text-slate-500 p-8 rounded-[2.5rem] bg-slate-900 border border-slate-800 flex flex-col items-center justify-center h-full">
            <Users className="text-slate-700" size={100} strokeWidth={1} />
            <p className="font-mono text-sm uppercase tracking-widest text-slate-600">Building Connection</p>
          </div>
        </section>

        {/* --- Founder's Message --- */}
        <section className="p-12 md:p-16 rounded-[2.5rem] bg-slate-900 border border-slate-800 shadow-2xl mb-32 relative overflow-hidden flex flex-col md:flex-row gap-12 items-center">
          <div className="absolute inset-0 bg-slate-950 rounded-3xl border border-slate-700/50 aspect-square w-[300px] md:w-[400px] -left-20 -top-20 opacity-30 -z-10 group-hover:scale-105 transition-transform" />
          
          <div className="w-48 h-48 md:w-60 md:h-60 rounded-full border-4 border-slate-700 shadow-xl overflow-hidden flex-shrink-0 relative group">
            {/* 💡 Stripe審査のコツ: ここに本物の顔写真を貼ってください。イラストよりも実写の方が信頼度が高いです。 */}
            <img 
              src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=400&auto=format&fit=crop" 
              alt="Founder: Ryo Sato" 
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            />
          </div>
          
          <div className="flex-1">
            <span className="text-indigo-400 font-black italic tracking-[0.4em] text-xs uppercase mb-4 block">Founder's Message</span>
            <h3 className="text-3xl md:text-4xl font-black text-white italic tracking-tighter uppercase mb-2">佐藤 亮 / Ryo Sato</h3>
            <p className="text-slate-500 font-medium uppercase tracking-[0.2em] text-sm mb-10">Direct Cheers Founder & CEO</p>
            
            <div className="space-y-6 text-slate-300 font-medium leading-relaxed max-w-3xl">
              <p>エンターテインメントの現場は、常に「その瞬間の熱量」に満ちています。<br />
              しかし、その素晴らしい体験が、ライブ終了後に記憶の中にだけ留まってしまうのを、私はもったいないと感じていました。</p>
              <p>「Direct Cheers」は、ファンの皆様の「Cheers!（応援）」をアーティストに直接届け、そのお礼として「絆の証明」をデジタルアセットとして受け取れるプラットフォームです。<br />
              一過性のイベントではなく、ライブ終了後もファンとアーティストが繋がれる新しい「体験の記録」を創ることを目指しています。</p>
              <p>皆様の熱い応援が、新しいエンターテインメントの未来を創ります。共に、このプラットフォームをハックしましょう！</p>
            </div>
          </div>
        </section>

        {/* --- Contact / Support --- */}
        <section className="text-center py-20 bg-gradient-to-br from-slate-900 to-slate-950 rounded-[3rem] border border-violet-500/10 shadow-3xl relative overflow-hidden flex flex-col items-center group">
          <div className="absolute -right-6 -top-6 w-40 h-40 bg-violet-500/10 blur-3xl group-hover:scale-110 transition-transform" />
          <h3 className="text-3xl md:text-4xl font-black text-white italic tracking-tighter uppercase mb-6 relative z-10">お問い合わせ・サポート</h3>
          <p className="text-slate-400 font-medium leading-relaxed max-w-xl mb-12 relative z-10">
            プラットフォームのご利用方法や、掲載をご希望のアーティスト様は、お気軽にお問い合わせください。<br />
            通常、2営業日以内に担当者よりご返信いたします。
          </p>
          <div className="flex flex-col md:flex-row gap-6 relative z-10 w-full justify-center px-10">
            <a href="mailto:support@direct-cheers.com" className="flex items-center justify-center gap-3 bg-white text-slate-950 h-16 rounded-2xl font-black text-lg hover:bg-pink-500 hover:text-white transition-all shadow-xl shadow-white/5 w-full md:w-auto md:px-12">
              <Mail size={22} fill="currentColor" className="text-slate-950 group-hover:text-white" />
              お問い合わせフォームへ
            </a>
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 text-left flex items-start gap-4 w-full md:w-auto md:max-w-xs">
              <MapPin className="text-slate-700 mt-1" size={24} />
              <div className="space-y-1">
                <p className="text-slate-300 font-bold text-sm">Direct Cheers Platform</p>
                <p className="text-slate-600 text-[11px] leading-relaxed">〒100-0004 東京都千代田区大手町1-1-1 (Demo Address)</p>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* --- Footer Area (Landing Pageと統一) --- */}
      <footer className="py-24 px-6 border-t border-slate-800 bg-slate-950 relative z-10">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 justify-between items-start gap-16">
          <div className="space-y-6">
            <h5 className="font-bold text-white tracking-tighter italic text-xl flex items-center gap-2">DIRECT CHEERS </h5>
            <p className="text-slate-500 text-[10px] max-w-xs leading-relaxed uppercase tracking-[0.3em]">Digital Assets for Live Moments.</p>
          </div>
          <div className="text-right flex flex-col items-end gap-4">
             <Link href="/" className="hover:text-pink-500 transition-colors text-slate-500 text-sm font-bold tracking-widest uppercase">BACK TO TOP</Link>
             <p className="text-slate-600 text-[10px] font-mono italic">© 2026 Direct Cheers Platform.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}