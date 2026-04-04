'use client';

import React from 'react';
import Link from 'next/link';
import { Award, CheckCircle2, Zap, ShieldCheck, Ticket, Construction, ChevronRight, BellDot } from "lucide-react";

export default function StandardPlanPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      <main className="max-w-6xl mx-auto pt-32 pb-20 px-6">
        
        {/* --- メインコンテンツエリア（ここだけ4xlで読みやすく） --- */}
        <div className="max-w-4xl mx-auto mb-32">
          <div className="flex items-center gap-4 mb-12">
            <div className="w-16 h-16 rounded-3xl bg-pink-500/10 flex items-center justify-center text-pink-500 border border-pink-500/20">
              <Award size={32} />
            </div>
            <div>
              <span className="text-pink-500 font-black italic tracking-widest text-xs uppercase">Plan ID: Standard</span>
              <h1 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter uppercase">Standard</h1>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="md:col-span-2 space-y-10">
              <section className="space-y-4">
                <h2 className="text-lg font-bold text-white uppercase tracking-wider border-l-4 border-pink-500 pl-4">役務の提供と完了の定義</h2>
                <p className="text-slate-400 text-sm leading-relaxed">
                  決済完了後、即座に応援の証跡となる「デジタル応援証明書」を発行します。本役務は、以下のいずれかの時点で提供完了とみなされます。
                </p>
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-3 text-sm">
                  <div className="flex gap-3 items-start">
                    <CheckCircle2 size={18} className="text-pink-500 shrink-0 mt-0.5" />
                    <span className="text-slate-300">ブラウザ上にシリアル番号入りのデジタル証明書が表示された時点</span>
                  </div>
                  <div className="flex gap-3 items-start">
                    <CheckCircle2 size={18} className="text-pink-500 shrink-0 mt-0.5" />
                    <span className="text-slate-300">または、システムデータベース（DB）へ利用者の識別情報と共に保有データが記録された時点</span>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-lg font-bold text-white uppercase tracking-wider border-l-4 border-pink-500 pl-4">デザインに関する仕様</h2>
                <p className="text-slate-400 text-sm leading-relaxed font-medium">
                  提供されるデジタル資産のビジュアルは、興行や主催者の設定に基づきます。プラットフォーム共通の標準デザインが適用される場合があり、アーティスト固有のデザインを常に確約するものではありません。
                </p>
              </section>
            </div>

            <div className="p-8 rounded-[2rem] bg-slate-900/80 border border-slate-800 h-fit">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Reference Price</p>
              <p className="text-5xl font-black text-white italic tracking-tighter">¥1,000</p>
              <p className="text-slate-600 text-[10px] font-mono mt-4 leading-relaxed uppercase">※上限額: ¥3,000<br />(1決済あたり)</p>
            </div>
          </div>
        </div>

        {/* --- フッター：トップページと同じ4つのBoxのうち、他3つを表示 --- */}
        <div className="pt-24 border-t border-slate-900">
          <h3 className="text-white font-black italic tracking-tighter text-2xl mb-12 text-center uppercase">Other Plans</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* 2. メッセージ (Topと同じ構成) */}
            <Link href="/concept/message" className="p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-violet-500/50 transition-all relative overflow-hidden text-left hover:bg-slate-900/60">
              <div className="absolute top-0 right-0 px-5 py-1.5 bg-green-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Auto Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-violet-500 border border-slate-700 group-hover:bg-violet-500/10 transition-colors"><BellDot size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Message</h4>
              </div>
              <div className="mb-8">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter">¥2,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium">
                <li className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-violet-500" /> 公式ログへの永続保存</li>
                <li className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-violet-500" /> アーティスト閲覧権の付与</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-violet-400 transition-colors">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span>
                <ChevronRight size={16} />
              </div>
            </Link>

            {/* 3. エントランス (Topと同じ構成) */}
            <Link href="/concept/entrance" className="p-8 rounded-[2.5rem] bg-slate-950 border-2 border-indigo-500/30 shadow-[0_0_40px_rgba(79,70,229,0.15)] flex flex-col group relative overflow-hidden text-left text-pretty hover:bg-indigo-500/5 transition-all">
              <div className="absolute top-0 right-0 px-5 py-1.5 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Review Required</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-colors"><Ticket size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Entrance</h4>
              </div>
              <div className="mb-8">
                <p className="text-indigo-300 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter">¥5,000</p>
              </div>
              <ul className="text-sm text-slate-300 space-y-3.5 mb-10 flex-1 font-semibold">
                <li className="flex items-center gap-2.5"><ShieldCheck size={18} className="text-amber-400" /> イベント入場権利の付与</li>
                <li className="flex items-center gap-2.5"><ShieldCheck size={18} className="text-amber-400" /> ノーショー時の免責条項</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-indigo-400 transition-colors">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span>
                <ChevronRight size={16} />
              </div>
            </Link>

            {/* 4. カスタム (Topと同じ構成) */}
            <Link href="/concept/custom" className="p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-amber-500/50 transition-all relative overflow-hidden text-left hover:bg-slate-900/60">
              <div className="absolute top-0 right-0 px-5 py-1.5 bg-amber-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Manual Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-amber-500 border border-slate-700 group-hover:bg-amber-500/10 transition-colors"><Construction size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Custom</h4>
              </div>
              <div className="mb-8">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter">¥10,000<span className="text-2xl">〜</span></p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium">
                <li className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-amber-500" /> 内容に応じた個別役務</li>
                <li className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-amber-500" /> 完了エビデンスの事前定義</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-amber-400 transition-colors">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span>
                <ChevronRight size={16} />
              </div>
            </Link>

          </div>
        </div>
      </main>
    </div>
  );
}