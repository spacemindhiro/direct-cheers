'use client';

import React from 'react';
import Link from 'next/link';
import { BellDot, CheckCircle2, MessageSquare, History, ArrowLeft, ShieldCheck, ArrowRight, Database, Search } from "lucide-react";

export default function MessagePlanPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      {/* --- Header --- */}
      <nav className="border-b border-slate-800 px-6 py-6">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
            <span className="text-xs font-bold tracking-widest uppercase">Back to Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-violet-500/10 flex items-center justify-center text-violet-500 border border-violet-500/20">
              <BellDot size={18} />
            </div>
            <span className="text-sm font-black italic uppercase tracking-tighter">Message Plan</span>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-20">
        {/* --- Hero Section --- */}
        <section className="mb-24 text-center">
          <h1 className="text-5xl md:text-7xl font-black text-white mb-8 italic tracking-tighter uppercase leading-tight">
            Digital<br />Message Log
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
            あなたの熱量を、消えない記録として刻む。<br />
            アーティストに直接届き、プラットフォームに永続保存される公式メッセージ権。
          </p>
        </section>

        {/* --- Core Service (役務の核心：2に集約) --- */}
        <section className="mb-24">
          <h2 className="text-xs font-black text-violet-500 uppercase tracking-[0.3em] mb-12 text-center">Core Service Features</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {/* 特徴1：DB保存 */}
            <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 relative group overflow-hidden">
              <div className="text-violet-500 mb-6"><Database size={40} /></div>
              <h3 className="text-2xl font-bold text-white mb-4 italic uppercase">公式アーカイブ保存</h3>
              <p className="text-sm text-slate-400 leading-relaxed font-medium">
                送信されたメッセージは、決済に使用したメールアドレスと紐づき、当プラットフォームのデータベースに**永久保存**されます。
                「誰が、いつ、どのイベントで、何を伝えたか」が公式な活動実績として蓄積されます。
              </p>
              <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                <Database size={160} />
              </div>
            </div>

            {/* 特徴2：アーティストへのデリバリー */}
            <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 relative group overflow-hidden">
              <div className="text-pink-500 mb-6"><MessageSquare size={40} /></div>
              <h3 className="text-2xl font-bold text-white mb-4 italic uppercase">アーティスト閲覧権</h3>
              <p className="text-sm text-slate-400 leading-relaxed font-medium">
                送信内容はアーティスト専用の管理ダッシュボードに即座に反映。
                公演中および終演後に、アーティスト本人がすべての応援メッセージをリスト形式で閲覧・確認できる環境を提供します。
              </p>
              <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
                <Search size={160} />
              </div>
            </div>
          </div>
        </section>

        {/* --- Compliance & Service Policy (Stripe対策) --- */}
        <section className="mb-24 p-8 md:p-12 bg-slate-900/30 border border-slate-800 rounded-[3rem] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-violet-500" />
          <h2 className="text-xl font-black text-white italic uppercase tracking-tighter mb-8 flex items-center gap-2">
            <ShieldCheck className="text-violet-500" size={24} /> 役務提供の定義と制約
          </h2>
          <div className="grid md:grid-cols-2 gap-10 text-sm text-slate-400">
            <div className="space-y-4">
              <h4 className="text-white font-bold uppercase tracking-widest text-xs">役務提供のタイミング</h4>
              <p className="leading-relaxed">
                ユーザーがメッセージを入力し、決済を完了させた瞬間に**「データベースへの書き込み」および「アーティスト閲覧用ダッシュボードへの掲載」**が行われます。
                この処理の完了をもって、本サービスの役務提供は完了したものとみなされます。
              </p>
            </div>
            <div className="space-y-4">
              <h4 className="text-white font-bold uppercase tracking-widest text-xs">コンテンツの品質管理</h4>
              <p className="leading-relaxed">
                送信内容はAIによる自動フィルタリングおよび運営による目視審査の対象となります。
                不適切な内容と判断された場合、アーカイブへの掲載が制限される場合がありますが、送信処理自体は実行されるため、返金の対象外となります。
              </p>
            </div>
          </div>
        </section>

        <div className="flex justify-center">
          <Link href="/demo" className="bg-white text-slate-950 px-10 py-4 rounded-full font-black text-sm hover:bg-violet-500 hover:text-white transition-all shadow-2xl uppercase tracking-widest flex items-center gap-2 group">
            メッセージの保存形式を確認する <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </main>

      <footer className="py-12 border-t border-slate-900 text-center">
        <p className="text-slate-600 text-[10px] font-mono italic uppercase tracking-widest">© 2026 Direct Cheers Platform - Evidence-Based Message Archiving</p>
      </footer>
    </div>
  );
}