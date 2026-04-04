'use client';

import React from 'react';
import Link from 'next/link';
import { Construction, CheckCircle2, ShieldCheck, ArrowLeft, ArrowRight, Camera, FileSearch, MessageSquare, Award } from "lucide-react";

export default function CustomPlanPage() {
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
            <div className="w-8 h-8 rounded bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
              <Construction size={18} />
            </div>
            <span className="text-sm font-black italic uppercase tracking-tighter">Custom Plan</span>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-20">
        {/* --- Hero Section --- */}
        <section className="mb-24 text-center">
          <h1 className="text-5xl md:text-7xl font-black text-white mb-8 italic tracking-tighter uppercase leading-tight">
            Special<br />Asset Bundle
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
            特別な体験と、その証となるデジタルカードのセット販売。<br />
            個別の合意に基づき、透明性の高いプロセスで役務を提供します。
          </p>
        </section>

        {/* --- Work Examples (具体的な提供例) --- */}
        <section className="mb-24">
          <h2 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] mb-12 text-center">Service Examples</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-8 rounded-[2.5rem] bg-slate-900/50 border border-slate-800">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2 italic">
                <Award className="text-amber-500" size={20} /> 限定デジタルアセット発行
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                特定の支援者のみに発行される、アーティスト直筆署名（デジタル）入りのプレミアム証明書の発行。
              </p>
            </div>
            <div className="p-8 rounded-[2.5rem] bg-slate-900/50 border border-slate-800">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2 italic">
                <Camera className="text-amber-500" size={20} /> 記念品送付・現場撮影
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                楽屋花や応援広告の設置、およびその完了を証明するシリアルナンバー入り写真データの提供。
              </p>
            </div>
          </div>
        </section>

        {/* --- Governance Process (事前審査と完了条件) --- */}
        <section className="mb-24 p-8 md:p-12 bg-slate-900/40 border border-slate-800 rounded-[3rem] relative">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <ShieldCheck size={120} />
          </div>
          <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-10 flex items-center gap-3">
            <FileSearch className="text-amber-500" size={28} /> 安全な取引のためのプロセス
          </h2>
          
          <div className="space-y-12">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="w-12 h-12 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-black italic shrink-0">01</div>
              <div>
                <h4 className="text-white font-bold mb-2 uppercase tracking-widest text-sm">事前内容審査</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  提供される役務が当プラットフォームの規約および法的要件に適合しているか、運営事務局が事前に審査を行います。承認された内容のみが決済対象となります。
                </p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="w-12 h-12 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-black italic shrink-0">02</div>
              <div>
                <h4 className="text-white font-bold mb-2 uppercase tracking-widest text-sm">完了条件の明確化</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  「証拠写真の提供」「デジタルデータの送付完了」など、何をもって役務完了とするかを事前に合意。客観的に確認可能な完了条件を設定します。
                </p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="w-12 h-12 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-black italic shrink-0">03</div>
              <div>
                <h4 className="text-white font-bold mb-2 uppercase tracking-widest text-sm">エビデンスの提出</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  役務実施後、提供者は完了を証明するデータ（写真・ログ等）を提出。システムを通じて購入者に共有されることで取引が確定します。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* --- Compliance Note --- */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex items-center gap-4 px-8 py-4 rounded-2xl bg-slate-950 border border-slate-800 shadow-xl max-w-md">
            <ShieldCheck className="text-amber-500 shrink-0" size={24} />
            <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
              本プランは「寄付」ではありません。特定の役務提供およびデジタル資産の譲渡に対する対価であり、すべての取引は審査ログと共に保存されます。
            </p>
          </div>
        </div>

        <div className="flex justify-center">
          <Link href="/demo" className="bg-white text-slate-950 px-10 py-4 rounded-full font-black text-sm hover:bg-amber-600 hover:text-white transition-all shadow-2xl uppercase tracking-widest flex items-center gap-2 group">
            カスタムプランの導入相談 <MessageSquare size={18} className="group-hover:scale-110 transition-transform" />
          </Link>
        </div>
      </main>

      <footer className="py-12 border-t border-slate-900 text-center">
        <p className="text-slate-600 text-[10px] font-mono italic uppercase tracking-[0.2em]">© 2026 Direct Cheers Platform - High-Value Transaction Governance</p>
      </footer>
    </div>
  );
}