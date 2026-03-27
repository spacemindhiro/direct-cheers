import React from 'react';
import Link from 'next/link';
import { Zap, Music, Cpu, ArrowLeft, ShieldCheck, Wallet } from "lucide-react";

export default function RealtimeConcept() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      <nav className="p-6 border-b border-slate-800 backdrop-blur-md bg-slate-950/80 sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2 text-sm font-bold hover:text-pink-500 transition-colors group">
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> BACK TO TOP
        </Link>
      </nav>

      <main className="max-w-4xl mx-auto py-20 px-6">
        {/* --- Header --- */}
        <section className="mb-20">
          <span className="text-pink-500 font-black italic tracking-widest text-sm uppercase">Concept 01</span>
          <h1 className="text-5xl md:text-7xl font-black text-white mt-4 mb-8 tracking-tighter italic uppercase leading-[1.1]">
            応援が、<br />空気を変える。
          </h1>
          <p className="text-xl text-slate-400 leading-relaxed font-medium">
            Direct Cheersは、単なる視聴体験ではありません。<br />
            あなたのスマートフォンから送られる「Cheers!」が、ライブ会場の空気に物理的な変化をもたらします。
          </p>
        </section>

        {/* --- Main Content --- */}
        <div className="grid gap-12">
          
          {/* ハックする体験 */}
          <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800 relative overflow-hidden group">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-pink-500/10 blur-3xl group-hover:bg-pink-500/20 transition-all" />
            <div className="flex items-start gap-6 relative z-10">
              <div className="bg-pink-500/10 p-4 rounded-2xl shrink-0">
                <Cpu className="text-pink-500" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic text-left">会場をハックする、ジュークボックスのような体験</h2>
                <p className="text-slate-400 leading-relaxed text-left">
                  かつてのジュークボックスが、コインひとつで店のムードを塗り替えたように。
                  Direct Cheersは、応援をトリガーに会場のシステムへ介入します。
                  ステージ上の照明、VJのモーショングラフィックス、あるいは特殊効果。
                  あなたの意思が、ライブ空間の一部をリアルタイムに書き換えていく感覚を提供します。
                </p>
              </div>
            </div>
          </div>

          {/* 双方向の可能性 */}
          <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800 relative overflow-hidden group">
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-violet-500/10 blur-3xl group-hover:bg-violet-500/20 transition-all" />
            <div className="flex items-start gap-6 relative z-10">
              <div className="bg-violet-500/10 p-4 rounded-2xl shrink-0">
                <Zap className="text-violet-500" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic text-left">双方向が創り出す、唯一無二の演出</h2>
                <p className="text-slate-400 leading-relaxed text-left">
                  演出は一方的に与えられるものではありません。
                  ステージの仕掛け次第で、さまざまな演出を起こすことが可能です。
                  応援の集積が、アーティストのパフォーマンスと共鳴し、その日、その瞬間にしか生まれない特別な景色を創り出します。
                </p>
              </div>
            </div>
          </div>

          {/* 実装の現実解 */}
          <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800">
            <div className="flex items-start gap-6">
              <div className="bg-indigo-500/10 p-4 rounded-2xl shrink-0">
                <Music className="text-indigo-500" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic text-left">空間演出とのシームレスな統合</h2>
                <p className="text-slate-400 leading-relaxed text-left">
                  会場の照明コンソールや映像システムとAPIで連携。
                  音響や全体の進行を妨げることなく、ライブの熱量を「視覚的なエネルギー」として空間に還元します。
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* --- Concept Navigation --- */}
        <section className="mt-32 pt-16 border-t border-slate-900">
          <h2 className="text-xs font-black text-slate-500 tracking-[0.3em] uppercase mb-12 text-center">Explore Other Concepts</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">

            {/* Real-time (Current) */}
            <div className="p-8 rounded-[2rem] border-2 border-pink-500 bg-pink-500/5 relative overflow-hidden">
              <div className="absolute top-4 right-4 text-[10px] font-black text-pink-500 tracking-widest uppercase">You are here</div>
              <Zap className="text-pink-500 mb-4" size={24} />
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Real-time</h3>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">01 リアルタイム演出連動</p>
            </div>

             {/* Wallet */}
            <Link href="/concept/wallet" className="p-8 rounded-[2rem] border border-slate-800 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-900/60 transition-all group">
              <Wallet className="text-slate-600 group-hover:text-cyan-400 transition-colors mb-4" size={24} />
              <h3 className="text-xl font-black text-slate-400 group-hover:text-white italic uppercase tracking-tighter transition-colors">Wallet</h3>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">02 スマホのウォレットに保存</p>
            </Link>

            {/* Proof (Updated from NFT) */}
            <Link href="/concept/proof" className="p-8 rounded-[2rem] border border-slate-800 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-900/60 transition-all group">
              <ShieldCheck className="text-slate-600 group-hover:text-indigo-400 transition-colors mb-4" size={24} />
              <h3 className="text-xl font-black text-slate-400 group-hover:text-white italic uppercase tracking-tighter transition-colors">Digital Proof</h3>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">03 シリアルナンバー証跡管理</p>
            </Link>
          </div>
        </section>

        {/* --- Footer Note --- */}
        <footer className="mt-20 pt-10 border-t border-slate-900 text-center">
          <p className="text-slate-600 text-sm italic font-mono uppercase tracking-widest">
            Transforming the venue with your cheers.
          </p>
        </footer>
      </main>
    </div>
  );
}