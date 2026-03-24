import React from 'react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      {/* --- Navigation --- */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-violet-600 rounded-lg shadow-lg shadow-pink-500/20 group-hover:scale-110 transition-transform" />
            <h1 className="text-xl font-black tracking-tighter text-white">DIRECT CHEERS</h1>
          </Link>
          
          <div className="hidden md:flex gap-8 text-sm font-medium">
            <Link href="#concept" className="hover:text-pink-500 transition-colors">コンセプト</Link>
            <Link href="#products" className="hover:text-pink-500 transition-colors">NFTアセット</Link>
            <Link href="/law" className="text-slate-400 hover:text-white underline decoration-pink-500/50 transition-colors">
              特定商取引法に基づく表記
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <button className="hidden sm:block text-xs font-bold text-slate-500 hover:text-white transition-colors">
              LOGIN
            </button>
            <button className="bg-white text-slate-950 px-5 py-2 rounded-full text-sm font-bold hover:bg-pink-500 hover:text-white transition-all shadow-xl shadow-white/5">
              COMING SOON
            </button>
          </div>
        </div>
      </nav>

      {/* --- Hero Section --- */}
      <section id="concept" className="relative py-24 px-6 overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-pink-500/10 blur-[120px] rounded-full -z-10" />
        
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-4 py-1.5 rounded-full border border-pink-500/30 text-pink-500 text-xs font-bold tracking-widest uppercase mb-6 bg-pink-500/5">
            Next-Gen Digital Ownership
          </span>
          <h2 className="text-5xl md:text-8xl font-black mb-8 tracking-tight text-white leading-[1.1]">
            その感動を、<br />
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              NFTで「所有」する。
            </span>
          </h2>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-12">
            Direct Cheersは、ライブの証をNFTとして発行。
            ブロックチェーンに刻まれた「あなただけの所有証明」が、デジタルアセットに唯一無二の価値を与えます。
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="#products" className="bg-pink-600 text-white px-10 py-4 rounded-full font-bold hover:bg-pink-500 transition-all transform hover:-translate-y-1 shadow-lg shadow-pink-600/20">
              NFTアセットを見る
            </Link>
          </div>
        </div>
      </section>

      {/* --- Product Detail Section --- */}
      <section id="products" className="py-24 bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-4 italic tracking-tighter">NFT DIGITAL ASSETS</h3>
            <p className="text-slate-400 max-w-xl mx-auto">
              すべてのCheers!はポリゴンネットワーク（予定）上でNFT化され、ガス代不要であなたのライブラリへ即座に届けられます。
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-8 rounded-3xl bg-slate-950 border border-slate-800 hover:border-pink-500/50 transition-all group">
              <div className="w-12 h-12 bg-pink-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-pink-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h4 className="text-xl font-bold text-white mb-4 text-left">永久的な所有証明</h4>
              <p className="text-slate-400 leading-relaxed text-sm text-left">
                ブロックチェーン技術により、あなたがその瞬間に会場にいた証、そしてアーティストを支援した事実が、改ざん不可能な状態で永久に記録されます。
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-8 rounded-3xl bg-slate-950 border border-slate-800 hover:border-violet-500/50 transition-all group">
              <div className="w-12 h-12 bg-violet-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-violet-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              </div>
              <h4 className="text-xl font-bold text-white mb-4 text-left">NFTマーケット対応</h4>
              <p className="text-slate-400 leading-relaxed text-sm text-left">
                発行されたアセットはOpenSeaなどの外部マーケットプレイスでの表示・管理が可能。イベントの思い出を二次流通制限付きでコレクションできます。
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-8 rounded-3xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 transition-all group">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-indigo-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h4 className="text-xl font-bold text-white mb-4 text-left">ガス代不要の体験</h4>
              <p className="text-slate-400 leading-relaxed text-sm text-left">
                独自のミントエンジンにより、複雑な暗号資産の知識やガス代は不要。使い慣れたクレジットカード決済のみで、NFTの所有を完結させます。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --- Footer Area --- */}
      <footer className="py-20 px-6 border-t border-slate-800 bg-slate-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gradient-to-br from-slate-700 to-slate-900 rounded" />
              <h5 className="font-bold text-white tracking-tighter">DIRECT CHEERS</h5>
            </div>
            <p className="text-slate-500 text-xs max-w-xs leading-relaxed">
              Direct Cheersは、ライブエンターテインメントの持続可能性をデジタルアセット技術で支援するプラットフォームです。
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-12 sm:gap-24">
            <div>
              <h6 className="text-white font-bold text-sm mb-6 uppercase tracking-widest">Service</h6>
              <ul className="text-slate-500 text-xs space-y-4">
                <li><Link href="/#concept" className="hover:text-white transition-colors">コンセプト</Link></li>
                <li><Link href="/#products" className="hover:text-white transition-colors">商品詳細</Link></li>
                <li><button className="hover:text-white transition-colors text-left">公式ガイド（準備中）</button></li>
              </ul>
            </div>
            <div>
              <h6 className="text-white font-bold text-sm mb-6 uppercase tracking-widest">Legal</h6>
              <ul className="text-slate-500 text-xs space-y-4">
                <li><Link href="/terms" className="hover:text-white transition-colors">利用規約</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">プライバシーポリシー</Link></li>
                <li><Link href="/law" className="text-pink-500 font-bold hover:underline transition-colors decoration-pink-500/30">特定商取引法に基づく表記</Link></li>
              </ul>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <h6 className="text-white font-bold text-sm mb-6 uppercase tracking-widest">Contact</h6>
              <ul className="text-slate-500 text-xs space-y-4">
                <li><Link href="/contact" className="hover:text-white transition-colors">お問い合わせフォーム</Link></li>
                <li className="text-[10px] text-slate-600">審査用のお問い合わせは<br />上記フォームより承ります。</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto mt-20 pt-8 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-600 text-[10px]">© 2026 Direct Cheers All Rights Reserved.</p>
          <div className="flex gap-4 opacity-30 grayscale contrast-125">
             {/* ここにStripeやPolygonのミニロゴを並べると信頼感が上がります */}
          </div>
        </div>
      </footer>
    </div>
  );
}