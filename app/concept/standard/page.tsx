'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Award, CheckCircle2, Zap, ShieldCheck, Ticket, 
  Construction, ChevronRight, BellDot, Wallet, 
  Smartphone, Database, LayoutDashboard, AlertTriangle 
} from "lucide-react";

export default function StandardPlanPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      
      {/* --- Header --- */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <img src="/logo-emblem.png" alt="Logo" className="w-8 h-8 rounded-lg shadow-lg shadow-pink-500/10 group-hover:scale-110 transition-transform" />
            <h1 className="text-xl font-black tracking-tighter text-white uppercase italic">Direct Cheers</h1>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xs font-bold text-slate-400 hover:text-white transition-colors">Back to Home</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto pt-24 pb-20 px-6 relative">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-pink-500/10 blur-[120px] rounded-full -z-10" />

        {/* --- Hero Section --- */}
        <section className="grid md:grid-cols-2 gap-16 items-center mb-24 text-pretty text-left">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-pink-500/10 flex items-center justify-center text-pink-500 border border-pink-500/20"><Award size={24} /></div>
              <span className="text-sm font-black italic uppercase tracking-tighter text-pink-400">Standard Plan Details</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-black text-white italic tracking-tighter uppercase leading-[1.1]">
              ライブの熱狂を、<br /><span className="bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent">永遠のコレクション</span>に。
            </h2>
            <p className="text-lg text-slate-400 leading-relaxed font-medium">
              それは、あなたがアーティストを支えた「動かぬ証拠」。シリアルナンバー入りのデジタル応援証明書が、あなたのスマホのウォレットへ。メールアドレスに紐づけてコレクションに保管されます。
            </p>
            <p className="text-pink-500 font-bold text-sm tracking-widest uppercase">
              [ 料金体系：¥50〜¥3,000 (税込) ]
            </p>
          </div>
          
          <div className="flex justify-center relative group">
            <div className="absolute inset-0 bg-pink-500/20 blur-3xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="w-64 h-96 bg-gradient-to-tr from-pink-600 to-violet-700 rounded-3xl shadow-2xl rotate-6 flex flex-col p-7 relative overflow-hidden border border-white/20 transition-transform group-hover:rotate-0 group-hover:scale-105 duration-500 text-left font-sans">
              <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/fabric-of-the-nation.png')]" />
              <div className="relative z-10 flex flex-col h-full">
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

        {/* --- メイン商品価値 --- */}
        <section className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 text-left hover:border-pink-500/30 transition-colors">
            <div className="text-pink-500 mb-6"><Database size={32} /></div>
            <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter">コレクション化</h3>
            <p className="text-slate-400 text-sm leading-relaxed font-medium mb-6">
              発行された証明書は、決済完了後のブラウザ表示とともに、決済で使用したメールアドレスと紐づけてシステムDBへ厳重に格納されます。メアドでログインすれば、過去の応援履歴をいつでもマイページから閲覧・管理可能です。
            </p>
            <div className="flex items-center gap-3 text-xs font-bold text-pink-400 uppercase tracking-widest">
              <LayoutDashboard size={16} />
              <span>ダッシュボードで一括管理</span>
            </div>
          </div>

          <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 text-left hover:border-indigo-500/30 transition-colors">
            <div className="text-indigo-400 mb-6"><Wallet size={32} /></div>
            <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter">Wallet 連携</h3>
            <p className="text-slate-400 text-sm leading-relaxed font-medium mb-6">
              Apple Wallet / Google Wallet への格納に完全対応。専用アプリを開くことなく、スマートフォンの標準機能から、いつでもあなたの「証跡」を呼び出し、提示することができます。
            </p>
            <div className="flex items-center gap-3 text-xs font-bold text-indigo-400 uppercase tracking-widest">
              <Smartphone size={16} />
              <span>スマホ標準Walletに対応</span>
            </div>
          </div>
        </section>

        {/* --- 役務定義セクション --- */}
        <section className="grid md:grid-cols-3 gap-8 mb-32 border-t border-slate-900 pt-16">
          <div className="md:col-span-2 space-y-8 text-left">
            <div className="flex items-center gap-3 text-slate-500">
              <Zap size={20} />
              <h3 className="text-sm font-bold uppercase tracking-[0.2em]">Service Definition / 役務の完了</h3>
            </div>
            <div className="bg-slate-900/30 border border-slate-800/50 rounded-2xl p-8 space-y-6">
              <p className="text-slate-500 text-xs leading-relaxed italic">
                本プランはデジタル資産の発行を目的としたサービスです。決済完了後、以下のいずれかの時点で役務提供完了と定義されます。
              </p>
              <div className="space-y-4 text-sm font-medium text-slate-400">
                <div className="flex gap-3 items-center">
                  <CheckCircle2 size={16} className="text-slate-600 shrink-0" />
                  <span>ブラウザ上にデジタル証明書が表示された時点（上限¥3,000の範囲内）</span>
                </div>
                <div className="flex gap-3 items-center">
                  <CheckCircle2 size={16} className="text-slate-600 shrink-0" />
                  <span>または、DBへ利用者の識別情報と共に保有データが登録された時点</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 rounded-2xl bg-slate-950 border border-slate-900 flex flex-col justify-center text-left">
            <div className="flex items-center gap-2 text-amber-600 mb-3">
              <AlertTriangle size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">Attention</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
              デザインは各興行の仕様に準じます。アーティスト固有の限定デザインを常に保証するものではありません。あらかじめご了承ください。
            </p>
          </div>
        </section>

        {/* --- 他のプラン --- */}
        <div className="pt-24 border-t border-slate-900 text-center">
          <h3 className="text-white font-black italic tracking-tighter text-2xl mb-12 uppercase">Explore More Plans</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
            
            {/* Message */}
            <Link href="/concept/message" className="relative p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-violet-500/50 transition-all text-left overflow-hidden">
              <div className="absolute top-0 right-0 z-10 px-5 py-1.5 bg-green-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Auto Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-violet-500 border border-slate-700 group-hover:bg-violet-500/10 transition-colors"><BellDot size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Message</h4>
              </div>
              <div className="mb-8 leading-none">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter leading-tight">¥2,000</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">上限：¥3,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium"><li className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-violet-500" /> 公式ログへの永続保存</li><li className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-violet-500" /> アーティスト閲覧権の付与</li></ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-violet-400 transition-colors"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span><ChevronRight size={16} /></div>
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