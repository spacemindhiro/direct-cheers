'use client';

import React from 'react';
import Link from 'next/link';
import { Play } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      {/* --- Navigation --- */}
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
          
          <div className="hidden md:flex gap-8 text-sm font-medium">
            {/* --- ✅ 修正箇所: About Us へのリンクを追加 --- */}
            <Link href="/about" className="text-pink-500 font-bold hover:text-white transition-colors uppercase tracking-widest">About Us</Link>
            <Link href="#concept" className="hover:text-pink-500 transition-colors">コンセプト</Link>
            <Link href="#demo" className="hover:text-pink-500 transition-colors italic">DEMO</Link>
            <Link href="#features" className="hover:text-pink-500 transition-colors">機能・体験</Link>
            <Link href="/law" className="text-slate-400 hover:text-white underline decoration-pink-500/50 transition-colors">特定商取引法</Link>
          </div>

          <div className="flex items-center gap-4">
            <button className="bg-white text-slate-950 px-5 py-2 rounded-full text-sm font-bold hover:bg-pink-500 hover:text-white transition-all shadow-xl shadow-white/5">
              JOIN NOW
            </button>
          </div>
        </div>
      </nav>

      {/* --- Hero Section --- */}
      <section id="concept" className="relative py-28 px-6 overflow-hidden border-b border-slate-900">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-pink-500/5 blur-[120px] rounded-full -z-10" />
        
        <div className="max-w-5xl mx-auto text-center">
          <span className="inline-block px-4 py-1.5 rounded-full border border-slate-800 text-slate-400 text-[10px] font-bold tracking-[0.2em] uppercase mb-8 bg-slate-900/50">
            Next-Gen Live Experience Platform
          </span>
          <h2 className="text-5xl md:text-8xl font-black mb-10 tracking-tighter text-white leading-[1.05]">
            ライブの感動を、<br />
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent italic">
              「スマホのウォレット」
            </span>
            へ。
          </h2>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-12 font-medium">
            Direct Cheersは、会場のQRコードから応援を贈るプラットフォーム。<br className="hidden md:block" />
            応援の証（Cheers!）は、シリアル入りのデジタルカードとして<br className="hidden md:block" />
            あなたのスマホのウォレットに直接届きます。
          </p>
          <div className="flex justify-center gap-6">
            <Link href="#demo" className="bg-slate-100 text-slate-900 px-10 py-4 rounded-full font-bold hover:bg-pink-500 hover:text-white transition-all shadow-2xl scale-110">
              体験を詳しく知る
            </Link>
          </div>
        </div>
      </section>

      {/* --- Demo Section --- */}
      <section id="demo" className="py-24 px-6 relative border-b border-slate-900">
        <div className="max-w-6xl mx-auto">
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-8 md:p-16 rounded-[3rem] relative overflow-hidden flex flex-col md:flex-row items-center gap-12 group">
            <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-pink-500/10 blur-[100px] rounded-full" />
            
            <div className="flex-1 relative z-10 text-left">
              <span className="text-pink-500 font-black italic tracking-[0.3em] text-[10px] uppercase block mb-4">Live Simulation</span>
              <h3 className="text-4xl md:text-5xl font-black text-white mb-6 italic tracking-tighter uppercase leading-tight">
                その手で、<br />
                演出をハックせよ。
              </h3>
              <p className="text-slate-400 leading-relaxed mb-8 max-w-md font-medium">
                ブラウザだけで体験できるデモページを用意しました。<br />
                スマホから応援を送り、ステージが反応する瞬間をシミュレーション。最後にはテスト用のウォレットカードも発行可能です。
              </p>
              <Link href="/demo" className="inline-flex items-center gap-3 bg-gradient-to-r from-pink-500 to-violet-600 text-white px-8 py-4 rounded-full font-bold hover:scale-105 transition-all shadow-xl shadow-pink-500/20">
                <Play size={18} fill="currentColor" />
                DEMOを今すぐ体験
              </Link>
            </div>

            <div className="flex-1 relative z-10 w-full md:w-auto">
              <div className="aspect-video bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden group-hover:border-pink-500/50 transition-colors">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-40 group-hover:scale-110 transition-transform duration-700" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 group-hover:bg-pink-500 transition-colors">
                    <Play className="text-white ml-1" size={32} fill="currentColor" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Features Section --- */}
      <section id="features" className="py-24 bg-slate-950 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h3 className="text-4xl font-black text-white mb-4 italic tracking-tighter uppercase">The Digital Experience</h3>
            <p className="text-slate-500">最新テクノロジーが変える、ライブエンターテインメントの未来</p>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            <Link href="/concept/realtime" className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800 hover:border-pink-500/30 transition-all group block text-left">
              <div className="text-pink-500 font-black text-5xl italic mb-6 opacity-50">01</div>
              <h4 className="text-2xl font-bold text-white mb-4 italic">リアルタイム演出連動</h4>
              <p className="text-sm text-slate-400 leading-relaxed">
                応援をトリガーに、会場のVJや照明が変化。あなたの「熱」が現場の景色を塗り替えます。
                <span className="block mt-2 text-[10px] text-slate-600">※一部の演出対応イベントにて順次展開予定</span>
              </p>
            </Link>

            <Link href="/concept/wallet" className="p-10 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-violet-500/20 shadow-2xl relative overflow-hidden group block text-left">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-violet-500/10 blur-3xl group-hover:bg-violet-500/20 transition-all" />
              <div className="text-violet-500 font-black text-5xl italic mb-6">02</div>
              <h4 className="text-2xl font-bold text-white mb-4 italic">スマホのウォレットに保存</h4>
              <p className="text-sm text-slate-400 leading-relaxed">
                購入した digital アセットは Apple Wallet や Google Wallet に簡単追加。
                シリアル刻印入りの記念カードを、いつでもどこでもスマホから呼び出せます。
              </p>
            </Link>

            <Link href="/concept/nft" className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800 hover:border-indigo-500/30 transition-all block text-left">
              <div className="text-indigo-500 font-black text-5xl italic mb-6">03</div>
              <h4 className="text-2xl font-bold text-white mb-4 italic">NFT技術による証跡管理</h4>
              <p className="text-sm text-slate-400 leading-relaxed">
                すべてのカードはブロックチェーン（NFT）によって唯一無二の価値を保証。
                厳格なアクセスログ管理により、正当なデジタル取引をプラットフォームが支えます。
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* --- Footer Area --- */}
      <footer className="py-24 px-6 border-t border-slate-800 bg-slate-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-16">
          <div className="space-y-6">
            <h5 className="font-bold text-white tracking-tighter italic text-xl">DIRECT CHEERS</h5>
            <p className="text-slate-500 text-[10px] max-w-xs leading-relaxed uppercase tracking-[0.3em]">
              Digital Assets for Live Moments.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-16 sm:gap-24 text-left">
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Navigation</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-medium">
                {/* --- ✅ 修正箇所: フッターのNavigationにも About Us を追加 --- */}
                <li><Link href="/about" className="text-pink-500 font-bold hover:underline transition-all">私たちについて (About Us)</Link></li>
                <li><Link href="/#concept" className="hover:text-pink-500 transition-colors">コンセプト</Link></li>
                <li><Link href="/demo" className="hover:text-pink-500 transition-colors italic">デモ体験</Link></li>
                <li><Link href="/#features" className="hover:text-pink-500 transition-colors">機能・体験</Link></li>
              </ul>
            </div>
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Legal</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-medium">
                <li><Link href="/terms" className="hover:text-white transition-colors">利用規約</Link></li>
                <li><Link href="/law" className="hover:text-white transition-colors">特定商取引法に基づく表記</Link></li>
                <li><Link href="/privacy" className="text-pink-500 font-bold hover:underline transition-all underline-offset-4">プライバシーポリシー</Link></li>
              </ul>
            </div>
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Support</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-medium">
                <li><Link href="/contact" className="hover:text-white transition-colors">お問い合わせ</Link></li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto mt-24 pt-8 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-600 text-[10px] font-mono italic">© 2026 Direct Cheers Platform.</p>
        </div>
      </footer>
    </div>
  );
}