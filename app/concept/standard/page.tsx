'use client';

import React from 'react';
import Link from 'next/link';
import { Award, CheckCircle2, Zap, ShieldCheck, Ticket, Construction, ChevronRight, BellDot, Wallet, Smartphone, Download } from "lucide-react";

export default function StandardPlanPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      
      {/* --- Header (Top共通) --- */}
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
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xs font-bold text-slate-400 hover:text-white transition-colors">Back to Home</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto pt-24 pb-20 px-6 relative">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-pink-500/10 blur-[120px] rounded-full -z-10" />

        {/* --- Hero Section (ワクワク感とビジュアル) --- */}
        <section className="grid md:grid-cols-2 gap-16 items-center mb-28 text-pretty">
          <div className="space-y-8 text-left">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-pink-500/10 flex items-center justify-center text-pink-500 border border-pink-500/20">
                <Award size={24} />
              </div>
              <span className="text-sm font-black italic uppercase tracking-tighter text-pink-400">Standard Cheers Card</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-black text-white italic tracking-tighter uppercase leading-[1.1]">
              ライブの熱狂を、<br />あなただけの<br /><span className="bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent">「証跡」</span>に。
            </h2>
            <p className="text-lg text-slate-400 leading-relaxed font-medium">
              決済完了後、即座に発行されるシリアルナンバー入りのデジタル応援証明書。ブラウザに表示され、メールアドレスに紐づきDBへ永久記録。それは「寄付」ではなく、あなたが確かにその場にいたことの証明です。
            </p>
          </div>
          
          {/* カードビジュアル */}
          <div className="flex justify-center relative group">
            <div className="absolute inset-0 bg-pink-500/20 blur-3xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="w-64 h-96 bg-gradient-to-tr from-pink-600 to-violet-700 rounded-3xl shadow-2xl rotate-6 flex flex-col p-7 relative overflow-hidden border border-white/20 transition-transform group-hover:rotate-0 group-hover:scale-105 duration-500">
              <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/fabric-of-the-nation.png')]" />
              <div className="relative z-10 flex flex-col h-full text-left">
                <div className="text-[10px] font-black tracking-widest text-white/70 mb-2 uppercase italic">Official Cheers!</div>
                <div className="text-2xl font-black italic text-white mb-8 tracking-tighter leading-none uppercase">Standard<br />Issue</div>
                <div className="flex-1" />
                <div className="border-t border-white/20 pt-4">
                  <div className="text-[8px] text-white/60 uppercase font-bold tracking-widest">Serial Number</div>
                  <div className="text-2xl font-mono font-black text-white tracking-tighter">#DC-004582-Z</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- 論理構成セクション (Stripe/安全対策) --- */}
        <section className="grid md:grid-cols-3 gap-8 mb-32">
          
          {/* 役務と定義 */}
          <div className="md:col-span-2 p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 text-left text-pretty">
            <div className="text-pink-500 mb-6"><Zap size={32} /></div>
            <h3 className="text-2xl font-bold text-white mb-6 italic uppercase tracking-tighter">役務の提供と完了の定義</h3>
            <div className="space-y-4 text-slate-400 text-sm leading-relaxed font-medium mb-8">
              <p>決済完了後、即座に応援の証跡となる「デジタル応援証明書」を発行します。本役務は、以下のいずれかの時点で提供完了とみなされます。</p>
            </div>
            <div className="space-y-4 text-sm bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
              <div className="flex gap-3 items-center">
                <CheckCircle2 size={18} className="text-pink-500 shrink-0" />
                <span className="text-slate-300">ブラウザ上にシリアル番号入りのデジタル証明書が表示された時点</span>
              </div>
              <div className="flex gap-3 items-center">
                <CheckCircle2 size={18} className="text-pink-500 shrink-0" />
                <span className="text-slate-300">または、識別情報と共にDBへ登録が完了した時点</span>
              </div>
            </div>
          </div>

          {/* Wallet・デザイン */}
          <div className="space-y-8 text-pretty">
            <div className="p-8 rounded-[2rem] bg-slate-900/50 border border-slate-800 text-left">
              <Wallet className="text-indigo-400 mb-4" size={24} />
              <h4 className="text-lg font-bold text-white mb-2 italic uppercase">Wallet 連携</h4>
              <p className="text-xs text-slate-500 leading-relaxed">Apple / Google Walletへの格納に対応。思い出をいつでもスマホから呼び出せます。</p>
            </div>
            <div className="p-8 rounded-[2rem] bg-slate-900/30 border border-slate-800 text-left">
              <AlertTriangle className="text-amber-500 mb-4" size={24} />
              <h4 className="text-lg font-bold text-white mb-2 italic uppercase">注意事項</h4>
              <p className="text-xs text-slate-500 leading-relaxed">ビジュアルは興行設定に基づき、アーティスト固有のデザインを常に確約するものではありません。</p>
            </div>
          </div>
        </section>

        {/* --- フッター：他のプラン (TopのBox構成を完全維持) --- */}
        <div className="pt-24 border-t border-slate-900 text-center">
          <h3 className="text-white font-black italic tracking-tighter text-2xl mb-12 uppercase">Other Service Plans</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
            
            {/* Message (Topと同じ構成) */}
            <Link href="/concept/message" className="p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-violet-500/50 transition-all text-left relative overflow-hidden">
              <div className="absolute top-0 right-0 px-5 py-1.5 bg-green-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Auto Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-violet-500 border border-slate-700 group-hover:bg-violet-500/10 transition-colors"><BellDot size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Message</h4>
              </div>
              <div className="mb-8">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter">¥2,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1">
                <li className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-violet-500" /> 公式ログへの永続保存</li>
                <li className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-violet-500" /> アーティスト閲覧権の付与</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-violet-400">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span>
                <ChevronRight size={16} />
              </div>
            </Link>

            {/* Entrance (Topと同じ構成) */}
            <Link href="/concept/entrance" className="p-8 rounded-[2.5rem] bg-slate-950 border-2 border-indigo-500/30 flex flex-col group text-left hover:bg-indigo-500/5 transition-all relative overflow-hidden">
              <div className="absolute top-0 right-0 px-5 py-1.5 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Review Required</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-colors"><Ticket size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Entrance</h4>
              </div>
              <div className="mb-8">
                <p className="text-indigo-300 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter">¥5,000</p>
              </div>
              <ul className="text-sm text-slate-300 space-y-3.5 mb-10 flex-1">
                <li className="flex items-center gap-2.5"><ShieldCheck size={18} className="text-amber-400" /> イベント入場権利の付与</li>
                <li className="flex items-center gap-2.5"><ShieldCheck size={18} className="text-amber-400" /> ノーショー時の免責条項</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-indigo-400">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span>
                <ChevronRight size={16} />
              </div>
            </Link>

            {/* Custom (Topと同じ構成) */}
            <Link href="/concept/custom" className="p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-amber-500/50 transition-all text-left relative overflow-hidden">
              <div className="absolute top-0 right-0 px-5 py-1.5 bg-amber-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Manual Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-amber-500 border border-slate-700 group-hover:bg-amber-500/10 transition-colors"><Construction size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Custom</h4>
              </div>
              <div className="mb-8">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter">¥10,000<span className="text-2xl">〜</span></p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1">
                <li className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-amber-500" /> 内容に応じた個別役務</li>
                <li className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-amber-500" /> 完了エビデンスの事前定義</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-amber-400">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span>
                <ChevronRight size={16} />
              </div>
            </Link>

          </div>
        </div>
      </main>

      {/* --- Footer (Top共通) --- */}
      <footer className="py-12 border-t border-slate-800 bg-slate-950 text-center">
        <p className="text-slate-600 text-[10px] font-mono italic">© 2026 Direct Cheers Platform.</p>
      </footer>
    </div>
  );
}