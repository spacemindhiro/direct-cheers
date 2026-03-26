'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, Target, Mail, MapPin, Zap, Award, ShieldCheck } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      {/* --- Background Effect --- */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-500/10 blur-[120px] rounded-full opacity-60" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full opacity-60" />
      </div>

      {/* --- Navigation --- */}
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
        <div className="mb-16">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-pink-500 transition-colors uppercase tracking-widest">
            <ArrowLeft size={16} /> BACK TO TOP
          </Link>
        </div>

        {/* --- Hero Section --- */}
        <section className="text-center mb-32 relative py-16">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-br from-pink-500/15 via-indigo-500/10 to-transparent blur-[100px] rounded-full -z-10" />
          <span className="text-pink-500 font-black italic tracking-[0.4em] text-xs uppercase mb-6 block">ABOUT THE PLATFORM</span>
          <h2 className="text-5xl md:text-7xl font-black mb-10 tracking-tighter text-white leading-[1.1] uppercase italic">
            ライブ体験を、<br />
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">永遠のアセットに。</span>
          </h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
            Direct Cheersは、アーティストとファンの熱狂をデジタル技術で記録し、共有可能な資産へと昇華させる新しいプラットフォームです。
          </p>
        </section>

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
              <p>一瞬のライブ体験が持つ、あの熱量を永遠の記録として残すこと。</p>
              <p>ファンからアーティストへの直接的な「Cheers!（応援）」を、最速かつ安全に届けること。</p>
              <p>デジタル証明技術を活用し、ファンの「応援の履歴」を所有可能な資産へと変えること。</p>
            </div>
          </div>
          <div className="space-y-6 text-center text-slate-500 p-8 rounded-[2.5rem] bg-slate-900 border border-slate-800 flex flex-col items-center justify-center h-full">
            <ShieldCheck className="text-slate-700" size={100} strokeWidth={1} />
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate-600 italic">Secure & Professional Management</p>
          </div>
        </section>

        {/* --- Founder's Message (資格情報追加) --- */}
        <section className="p-12 md:p-16 rounded-[2.5rem] bg-slate-900 border border-slate-800 shadow-2xl mb-32 relative overflow-hidden">
          <div className="flex flex-col md:flex-row gap-12 items-center relative z-10">
            <div className="w-48 h-48 md:w-60 md:h-60 rounded-full border-4 border-slate-700 shadow-xl overflow-hidden flex-shrink-0 relative">
              <img 
                src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=400&auto=format&fit=crop" 
                alt="Founder: Hirotaka Moriwaki" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1">
              <span className="text-indigo-400 font-black italic tracking-[0.4em] text-xs uppercase mb-4 block">Founder's Message</span>
              <h3 className="text-3xl md:text-4xl font-black text-white italic tracking-tighter uppercase mb-2">森脇 弘貴 / Hirotaka Moriwaki</h3>
              <p className="text-slate-500 font-medium uppercase tracking-[0.2em] text-sm mb-6">Direct Cheers Founder & CEO</p>
              
              {/* ✅ 保有資格バッジセクション */}
              <div className="flex flex-wrap gap-3 mb-8">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold uppercase tracking-tighter">
                  <Award size={14} /> 応用情報処理技術者
                </span>
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950 border border-pink-500/40 text-pink-300 text-[10px] font-bold uppercase tracking-tighter">
                  <Award size={14} /> PMP (Project Management Professional)
                </span>
              </div>

              <div className="space-y-6 text-slate-300 font-medium leading-relaxed italic text-sm md:text-base">
                <p>25年以上にわたるクレジットシステムのエンジニア経験と、20年以上にわたるDJイベントの主催経験。</p>
                <p>この二つの背景を、国際標準のプロジェクト管理スキル（PMP）と確かな技術力（応用情報処理技術者）で統合し、Direct Cheersを構築しました。</p>
                <p>音楽イベントにおける主催者と出演者の収益を改善し、ファンとの熱い交流を促すシステムの提供によって、音楽シーンの発展に寄与できるよう努めて参ります。</p>
              </div>
            </div>
          </div>
        </section>

        {/* --- Contact --- */}
        <section className="text-center py-20 bg-gradient-to-br from-slate-900 to-slate-950 rounded-[3rem] border border-violet-500/10 shadow-3xl relative overflow-hidden flex flex-col items-center group">
          <h3 className="text-3xl md:text-4xl font-black text-white italic tracking-tighter uppercase mb-6">お問い合わせ</h3>
          <p className="text-slate-400 font-medium leading-relaxed max-w-xl mb-12">
            掲載をご希望のアーティスト様はお気軽にご相談ください。
          </p>
          <div className="flex flex-col md:flex-row gap-6 w-full justify-center px-10 relative z-10">
            <a href="mailto:support@direct-cheers.com" className="flex items-center justify-center gap-3 bg-white text-slate-950 h-16 rounded-2xl font-black text-lg hover:bg-pink-500 hover:text-white transition-all w-full md:w-auto md:px-12">
              <Mail size={22} fill="currentColor" />
              お問い合わせフォームへ
            </a>
          </div>
        </section>
      </main>

      <footer className="py-24 px-6 border-t border-slate-800 bg-slate-950">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <p className="text-slate-600 text-[10px] font-mono italic tracking-widest uppercase">© 2026 Direct Cheers Platform.</p>
          <Link href="/" className="text-slate-500 hover:text-pink-500 transition-colors text-xs font-bold uppercase tracking-widest">Back to Top</Link>
        </div>
      </footer>
    </div>
  );
}