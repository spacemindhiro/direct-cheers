'use client';

import React from 'react';
import Link from 'next/link';
import { 
  BellDot, CheckCircle2, MessageSquare, History, ArrowLeft, 
  ShieldCheck, ArrowRight, Database, Search, Award, 
  Smartphone, Zap, Ticket, Construction, ChevronRight 
} from "lucide-react";

export default function MessagePlanPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      {/* --- Header --- */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
            <span className="text-xs font-bold tracking-widest uppercase">Back to Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-violet-500/10 flex items-center justify-center text-violet-500 border border-violet-500/20">
              <BellDot size={18} />
            </div>
            <span className="text-sm font-black italic uppercase tracking-tighter text-white">Message Plan</span>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto pt-24 pb-20 px-6 relative">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-500/10 blur-[120px] rounded-full -z-10" />

        {/* --- Hero Section --- */}
        <section className="grid md:grid-cols-2 gap-16 items-center mb-24 text-pretty text-left">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-500 border border-violet-500/20"><MessageSquare size={24} /></div>
              <span className="text-sm font-black italic uppercase tracking-tighter text-violet-400">Digital Message Log</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-black text-white italic tracking-tighter uppercase leading-[1.1]">
              想いを刻み、<br /><span className="bg-gradient-to-r from-violet-500 to-pink-500 bg-clip-text text-transparent">証跡として残す。</span>
            </h2>
            <p className="text-lg text-slate-400 leading-relaxed font-medium">
              アーティストに直接届くメッセージ権に加え、Standardプラン同様の「デジタル応援証明書」を発行。あなたの言葉は証明書と紐づけられ、消えない熱量としてコレクションされます。
            </p>
            <p className="text-violet-500 font-bold text-sm tracking-widest uppercase">
              [ 料金体系：¥50〜¥5,000 (税込) ]
            </p>
          </div>
          
          {/* Card Visual with Message context */}
          <div className="flex justify-center relative group">
            <div className="absolute inset-0 bg-violet-500/20 blur-3xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="w-64 h-96 bg-gradient-to-tr from-slate-900 to-violet-950 rounded-3xl shadow-2xl -rotate-3 flex flex-col p-7 relative overflow-hidden border border-violet-500/30 transition-transform group-hover:rotate-0 group-hover:scale-105 duration-500 text-left font-sans">
              <div className="relative z-10 flex flex-col h-full">
                <div className="text-[10px] font-black tracking-widest text-violet-400 mb-2 uppercase italic">Message & Cheers</div>
                <div className="text-2xl font-black italic text-white mb-4 tracking-tighter leading-none uppercase text-pretty">VOICE OF<br />FAN</div>
                <div className="flex-1 bg-white/5 rounded-xl p-3 border border-white/10 overflow-hidden">
                  <div className="text-[8px] text-white/40 uppercase font-bold tracking-tighter mb-1">Your Message</div>
                  <div className="text-[10px] text-white/80 leading-tight italic">"最高のライブをありがとう！一生ついていきます！"</div>
                </div>
                <div className="border-t border-white/20 pt-4 mt-4">
                  <div className="text-[8px] text-white/60 uppercase font-bold tracking-widest">Serial Number</div>
                  <div className="text-2xl font-mono font-black text-white tracking-tighter">#MSG-992011-B</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- Core Service Features --- */}
        <section className="grid md:grid-cols-3 gap-8 mb-24">
          <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 text-left hover:border-violet-500/30 transition-colors">
            <div className="text-violet-500 mb-6"><Award size={32} /></div>
            <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter">応援証明書の自動発行</h3>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">
              メッセージ送信と同時に、Standardプランと同等のデジタル応援証明書を発行。Apple/Google Walletへ即座に格納可能です。
            </p>
          </div>

          <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 text-left hover:border-pink-500/30 transition-colors">
            <div className="text-pink-500 mb-6"><Database size={32} /></div>
            <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter">メッセージ紐付け保存</h3>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">
              送った内容は証明書データに完全に紐づけ。Walletのカード裏面や、マイページのコレクション詳細からいつでも振り返ることができます。
            </p>
          </div>

          <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 text-left hover:border-indigo-500/30 transition-colors">
            <div className="text-indigo-400 mb-6"><Search size={32} /></div>
            <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter">アーティスト閲覧権</h3>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">
              送信内容はアーティスト専用の管理ダッシュボードに反映。アーティスト本人がすべての応援をリスト形式で閲覧できる環境を提供します。
            </p>
          </div>
        </section>

        {/* --- Compliance & Service Policy --- */}
        <section className="mb-32 p-8 md:p-12 bg-slate-900/30 border border-slate-800 rounded-[3rem] relative overflow-hidden text-left">
          <div className="absolute top-0 left-0 w-1 h-full bg-violet-500" />
          <h2 className="text-xl font-black text-white italic uppercase tracking-tighter mb-8 flex items-center gap-2">
            <ShieldCheck className="text-violet-500" size={24} /> 役務提供の定義と制約
          </h2>
          <div className="grid md:grid-cols-2 gap-10 text-sm text-slate-400">
            <div className="space-y-4">
              <h4 className="text-white font-bold uppercase tracking-widest text-[10px]">役務提供のタイミング</h4>
              <p className="leading-relaxed font-medium">
                決済完了後、**「データベースへの書き込み」「応援証明書の発行」「アーティスト閲覧画面への掲載」**がシステム上で行われた時点で役務完了とみなします。
              </p>
            </div>
            <div className="space-y-4 text-xs">
              <h4 className="text-white font-bold uppercase tracking-widest text-[10px]">コンテンツの品質管理</h4>
              <p className="leading-relaxed font-medium">
                送信内容はAIフィルタリングの対象となります。公序良俗に反する内容はアーカイブ掲載が制限されますが、送信処理自体は実行されるため返金対象外となります。
              </p>
            </div>
          </div>
        </section>

        {/* --- 他のプラン (Standardページと統一) --- */}
        <div className="pt-24 border-t border-slate-900 text-center">
          <h3 className="text-white font-black italic tracking-tighter text-2xl mb-12 uppercase">Explore Other Plans</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
            
            {/* Standard */}
            <Link href="/concept/standard" className="relative p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-pink-500/50 transition-all text-left overflow-hidden">
              <div className="absolute top-0 right-0 z-10 px-5 py-1.5 bg-green-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Auto Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-pink-500 border border-slate-700 group-hover:bg-pink-500/10 transition-colors"><Award size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Standard</h4>
              </div>
              <div className="mb-8 leading-none">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter leading-tight">¥1,000</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">上限：¥3,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium"><li className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-pink-500" /> デジタル応援証明書の発行</li><li className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-pink-500" /> Wallet / コレクション管理</li></ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-pink-400 transition-colors"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span><ChevronRight size={16} /></div>
            </Link>

           {/* Entrance (Review Process) */}
            <Link href="/concept/entrance" className="relative p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-indigo-500/50 transition-all text-left overflow-hidden">
              <div className="absolute top-0 right-0 z-10 px-5 py-1.5 bg-indigo-600/80 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg flex items-center gap-1">
                 Review Required
              </div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-indigo-400 border border-slate-700 group-hover:bg-indigo-500/10 transition-colors"><Ticket size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Entrance</h4>
              </div>
              <div className="mb-8 leading-none">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter leading-tight">¥5,000</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">上限：¥30,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium">
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-indigo-400 shrink-0" /> デジタル入場権利の発行</li>
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-indigo-400 shrink-0" /> エージェントによる価格適正審査</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-indigo-400 transition-colors font-bold"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span><ChevronRight size={16} /></div>
            </Link>


            {/* Custom */}
            <Link href="/concept/custom" className="relative p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-amber-500/50 transition-all text-left overflow-hidden">
              <div className="absolute top-0 right-0 z-10 px-5 py-1.5 bg-amber-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Manual Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-amber-500 border border-slate-700 group-hover:bg-amber-500/10 transition-colors"><Construction size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Custom</h4>
              </div>
              <div className="mb-8 leading-none">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter leading-tight">¥10,000</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">上限：¥100,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium"><li className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-amber-500" /> 内容に応じた個別役務</li><li className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-amber-500" /> 完了エビデンスの事前定義</li></ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-amber-400 transition-colors"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span><ChevronRight size={16} /></div>
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-12 border-t border-slate-800 bg-slate-950 text-center font-sans">
        <p className="text-slate-600 text-[10px] font-mono italic">© 2026 Direct Cheers Platform.</p>
      </footer>
    </div>
  );
}