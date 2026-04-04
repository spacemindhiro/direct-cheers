'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Construction, CheckCircle2, ShieldCheck, ArrowLeft, 
  Camera, FileSearch, MessageSquare, Award, Sparkles, 
  Zap, Scale, ChevronRight, Ticket 
} from "lucide-react";

export default function CustomPlanPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-amber-500/30 overflow-x-hidden text-left">
      {/* --- Header --- */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4 text-left text-pretty">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
            <span className="text-xs font-bold tracking-widest uppercase">Back to Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
              <Construction size={18} />
            </div>
            <span className="text-sm font-black italic uppercase tracking-tighter text-white">Custom Plan</span>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto pt-24 pb-20 px-6 relative">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-500/5 blur-[120px] rounded-full -z-10" />

        {/* --- Hero Section --- */}
        <section className="grid md:grid-cols-2 gap-16 items-center mb-24 text-pretty">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                <Sparkles size={24} />
              </div>
              <span className="text-sm font-black italic uppercase tracking-tighter text-amber-500">Co-Creation & Governance</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-white italic tracking-tighter uppercase leading-[1.1]">
              アイデアを、<br /><span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">価値ある資産へ。</span>
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed font-medium">
              固定概念に縛られない、アーティスト独自の「体験」や「無形資産」をパッケージ化。運営エージェントと共に価値を定義し、客観的な証拠（エビデンス）を伴う透明性の高い高付加価値サービスを提供します。
            </p>
            <p className="text-amber-500 font-bold text-sm tracking-widest uppercase">
              [ 推奨単価：¥10,000〜¥100,000+ (税込) ]
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[3rem] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl -z-10 group-hover:bg-amber-500/20 transition-colors" />
            <div className="space-y-6">
              <div className="flex items-center gap-4 border-b border-slate-800 pb-6">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500"><Zap size={20} /></div>
                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter text-pretty">企画・検証・提供のフロー</h3>
              </div>
              <ul className="space-y-4">
                <li className="flex gap-4 items-start">
                  <div className="mt-1 text-amber-500"><CheckCircle2 size={18} /></div>
                  <p className="text-sm text-slate-300 font-medium leading-relaxed">エージェントが企画の公序良俗・妥当性を事前審査</p>
                </li>
                <li className="flex gap-4 items-start text-pretty">
                  <div className="mt-1 text-amber-500"><CheckCircle2 size={18} /></div>
                  <p className="text-sm text-slate-300 font-medium leading-relaxed">「何をもって完了か」の客観的条件（写真・データ等）を合意</p>
                </li>
                <li className="flex gap-4 items-start text-pretty">
                  <div className="mt-1 text-amber-500"><CheckCircle2 size={18} /></div>
                  <p className="text-sm text-slate-300 font-medium leading-relaxed">デジタルカードと共に、検証可能な記録を購入者へ提供</p>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* --- Value Examples (アイデアの具体化) --- */}
        <section className="mb-24">
          <h2 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] mb-12 text-center text-pretty">価値創出のアイデア例</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 hover:border-amber-500/30 transition-colors">
              <div className="text-amber-500 mb-6"><Award size={32} /></div>
              <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter leading-tight text-pretty">直筆署名・限定証</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium text-pretty">
                デジタルデータに対し、アーティストが個別に署名を行う様子を記録。唯一無二のデジタル資産として発行します。
              </p>
            </div>
            <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 hover:border-amber-500/30 transition-colors">
              <div className="text-amber-500 mb-6"><Camera size={32} /></div>
              <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter leading-tight text-pretty">現場エビデンス提供</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium text-pretty">
                楽屋花や応援広告の掲出など、物理的なアクションをシリアルナンバー入りの写真で報告し、提供記録を永続化。
              </p>
            </div>
            <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 hover:border-amber-500/30 transition-colors">
              <div className="text-amber-500 mb-6"><Construction size={32} /></div>
              <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter leading-tight text-pretty">個別合意の役務</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium text-pretty">
                特定のイベントでの個別対応など、エージェントが「実現可能かつ検証可能」と判断した独自のアイデアを形にします。
              </p>
            </div>
          </div>
        </section>

        {/* --- Governance Section --- */}
        <section className="mb-32 p-8 md:p-12 bg-slate-900/30 border border-slate-800 rounded-[3rem] relative overflow-hidden text-pretty">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <h2 className="text-xl font-black text-white italic uppercase tracking-tighter mb-8 flex items-center gap-2">
            <Scale className="text-amber-500" size={24} /> 高額決済に対するガバナンス
          </h2>
          <div className="grid md:grid-cols-2 gap-10 text-sm text-slate-400">
            <div className="space-y-4">
              <h4 className="text-white font-bold uppercase tracking-widest text-[10px]">客観的な完了証明</h4>
              <p className="leading-relaxed font-medium">
                本プランでは「感謝の気持ち」といった抽象的な対価ではなく、写真、動画、ログデータ、配送記録など、第三者が客観的に確認可能な「エビデンス」の提供を義務付けています。
              </p>
            </div>
            <div className="space-y-4 text-pretty">
              <h4 className="text-white font-bold uppercase tracking-widest text-[10px]">不当な資金移動の防止</h4>
              <p className="leading-relaxed font-medium">
                設定価格が提供役務に対して著しく不当でないか、エージェントが市場価格に基づき審査します。実体のない寄付行為や、不透明な高額決済は一切承認されません。
              </p>
            </div>
          </div>
        </section>

        {/* --- Explore Other Plans (Entranceの文言を修正して追加) --- */}
        <div className="pt-24 border-t border-slate-900 text-center">
          <h3 className="text-white font-black italic tracking-tighter text-2xl mb-12 uppercase leading-none text-pretty">Explore Other Plans</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
            
            {/* Entrance (修正版：価格審査を強調) */}
            <Link href="/concept/entrance" className="relative p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-indigo-500/50 transition-all text-left overflow-hidden">
              <div className="absolute top-0 right-0 z-10 px-5 py-1.5 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Auto Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-indigo-400 border border-slate-700 group-hover:bg-indigo-500/10 transition-colors"><Ticket size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Entrance</h4>
              </div>
              <div className="mb-8 leading-none">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1 text-left">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter leading-tight text-left">¥3,000</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest text-left text-pretty">上限：¥30,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium font-sans">
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-indigo-400 shrink-0" /> デジタル入場権利の発行</li>
                <li className="flex items-center gap-2.5 font-bold text-pretty text-indigo-400/80 leading-tight"><Scale size={16} className="shrink-0" /> エージェントによる価格適正審査</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-indigo-400 transition-colors font-bold"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span><ChevronRight size={16} /></div>
            </Link>

            {/* Standard */}
            <Link href="/concept/standard" className="relative p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-pink-500/50 transition-all text-left overflow-hidden">
              <div className="absolute top-0 right-0 z-10 px-5 py-1.5 bg-green-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Auto Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-pink-500 border border-slate-700 group-hover:bg-pink-500/10 transition-colors"><Award size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Standard</h4>
              </div>
              <div className="mb-8 leading-none">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1 text-left">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter leading-tight text-left">¥1,000</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest text-left">上限：¥3,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium font-sans">
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-pink-500 shrink-0" /> デジタル応援証明書の発行</li>
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-pink-500 shrink-0" /> Wallet / コレクション管理</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-pink-400 transition-colors font-bold"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span><ChevronRight size={16} /></div>
            </Link>

            {/* Message */}
            <Link href="/concept/message" className="relative p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-violet-500/50 transition-all text-left overflow-hidden">
              <div className="absolute top-0 right-0 z-10 px-5 py-1.5 bg-violet-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Auto Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-violet-400 border border-slate-700 group-hover:bg-violet-500/10 transition-colors"><MessageSquare size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Message</h4>
              </div>
              <div className="mb-8 leading-none">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1 text-left">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter leading-tight text-left">¥2,000</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest text-left text-pretty">上限：¥5,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium font-sans text-pretty">
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-violet-400 shrink-0" /> アーティスト閲覧用メッセージ</li>
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-violet-400 shrink-0" /> 内容記録型デジタル証明書</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-violet-400 transition-colors font-bold"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span><ChevronRight size={16} /></div>
            </Link>

          </div>
        </div>
      </main>

      <footer className="py-12 border-t border-slate-800 bg-slate-950 text-center font-sans">
        <p className="text-slate-600 text-[10px] font-mono italic">© 2026 Direct Cheers Platform - High-Value Transaction Governance</p>
      </footer>
    </div>
  );
}