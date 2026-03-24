import React from 'react';
import Link from 'next/link';
import { Zap, Music, Cpu, ArrowLeft } from "lucide-react";

export default function RealtimeConcept() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      <nav className="p-6 border-b border-slate-800">
        <Link href="/" className="flex items-center gap-2 text-sm font-bold hover:text-pink-500 transition-colors">
          <ArrowLeft size={16} /> BACK TO TOP
        </Link>
      </nav>

      <main className="max-w-4xl mx-auto py-20 px-6">
        {/* --- Header --- */}
        <section className="mb-20">
          <span className="text-pink-500 font-black italic tracking-widest text-sm uppercase">Concept 01</span>
          <h1 className="text-5xl md:text-7xl font-black text-white mt-4 mb-8 tracking-tighter italic uppercase">
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
          <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800">
            <div className="flex items-start gap-6">
              <div className="bg-pink-500/10 p-4 rounded-2xl">
                <Cpu className="text-pink-500" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic">会場をハックする、ジュークボックスのような体験</h2>
                <p className="text-slate-400 leading-relaxed">
                  かつてのジュークボックスが、コインひとつで店のムードを塗り替えたように。
                  Direct Cheersは、応援をトリガーに会場のシステムへ介入します。
                  ステージ上の照明、VJのモーショングラフィックス、あるいは特殊効果。
                  あなたの意思が、ライブ空間の一部をリアルタイムに書き換えていく感覚を提供します。
                </p>
              </div>
            </div>
          </div>

          {/* 双方向の可能性 */}
          <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800">
            <div className="flex items-start gap-6">
              <div className="bg-violet-500/10 p-4 rounded-2xl">
                <Zap className="text-violet-500" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic">双方向が創り出す、唯一無二の演出</h2>
                <p className="text-slate-400 leading-relaxed">
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
              <div className="bg-indigo-500/10 p-4 rounded-2xl">
                <Music className="text-indigo-500" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic">空間演出とのシームレスな統合</h2>
                <p className="text-slate-400 leading-relaxed">
                  会場の照明コンソールや映像システムとAPIで連携。
                  音響や全体の進行を妨げることなく、ライブの熱量を「視覚的なエネルギー」として空間に還元します。
                </p>
              </div>
            </div>
          </div>

        </div>

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