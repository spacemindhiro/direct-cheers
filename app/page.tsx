import React from 'react';
import Link from 'next/link';
import { Hero } from "@/components/hero";
import { SignUpUserSteps } from "@/components/tutorial/sign-up-user-steps";

export default function Index() {
  return (
    <div className="flex-1 w-full flex flex-col bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      {/* 1. 共通Heroコンポーネント (ナビゲーション要素を含む場合があるため最上部へ) */}
      <Hero />

      <main className="flex-1 flex flex-col gap-24">
        {/* --- Concept Cards Section --- */}
        <section id="features" className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-20">
              <h3 className="text-4xl font-black text-white mb-4 italic tracking-tighter uppercase">The Digital Experience</h3>
              <div className="h-px w-24 bg-gradient-to-r from-pink-500 to-violet-600 mx-auto" />
            </div>

            <div className="grid md:grid-cols-3 gap-10">
              {/* 01: 演出連動 */}
              <Link href="/concept/realtime" className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800 hover:border-pink-500/30 transition-all group">
                <div className="text-pink-500 font-black text-5xl italic mb-6 opacity-50 group-hover:opacity-100 transition-opacity">01</div>
                <h4 className="text-2xl font-bold text-white mb-4 italic">リアルタイム演出連投</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  応援をトリガーに会場の景色が変化。あなたの熱量が現場を塗り替えます。
                </p>
              </Link>

              {/* 02: スマホウォレット */}
              <Link href="/concept/wallet" className="p-10 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-violet-500/20 shadow-2xl relative overflow-hidden group">
                <div className="absolute -right-6 -top-6 w-32 h-32 bg-violet-500/10 blur-3xl group-hover:bg-violet-500/20 transition-all" />
                <div className="text-violet-500 font-black text-5xl italic mb-6">02</div>
                <h4 className="text-2xl font-bold text-white mb-4 italic">スマホのウォレットに保存</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  シリアル刻印入りの記念カードを、Apple/Google Walletへ。いつでもスマホから呼び出せます。
                </p>
              </Link>

              {/* 03: 証跡管理 */}
              <Link href="/concept/nft" className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800 hover:border-indigo-500/30 transition-all group">
                <div className="text-indigo-500 font-black text-5xl italic mb-6 opacity-50 group-hover:opacity-100 transition-opacity">03</div>
                <h4 className="text-2xl font-bold text-white mb-4 italic">NFT技術による証跡管理</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  すべてのカードはブロックチェーンで唯一無二の価値を保証。正当な取引をシステムが支えます。
                </p>
              </Link>
            </div>
          </div>
        </section>

        {/* --- Sign Up Section --- */}
        <section className="py-24 border-t border-slate-900 bg-slate-950 flex flex-col items-center px-6">
          <div className="max-w-md w-full text-center">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.4em] mb-12 text-slate-500">Next Stage</h2>
            <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl">
              <SignUpUserSteps />
            </div>
          </div>
        </section>
      </main>

      {/* --- Footer Area --- */}
      <footer className="py-20 px-6 border-t border-slate-900 bg-slate-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <p className="text-slate-600 text-[10px] font-mono italic tracking-[0.2em]">© 2026 DIRECT CHEERS PLATFORM.</p>
          <div className="flex gap-8 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/law" className="text-pink-500 hover:underline underline-offset-4">Legal</Link>
            <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}