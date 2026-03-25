import React from 'react';
import Link from 'next/link';
import { Smartphone, Bell, Gift, ArrowLeft, Zap, Fingerprint } from "lucide-react";

export default function WalletConcept() {
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
          <span className="text-violet-500 font-black italic tracking-widest text-sm uppercase">Concept 02</span>
          <h1 className="text-5xl md:text-7xl font-black text-white mt-4 mb-8 tracking-tighter italic uppercase leading-[1.1]">
            スマホのウォレットが、<br />
            <span className="bg-gradient-to-r from-violet-500 to-pink-500 bg-clip-text text-transparent">
              「絆の証」
            </span>
            になる。
          </h1>
          <p className="text-xl text-slate-400 leading-relaxed font-medium">
            Apple WalletやGoogle Walletに保存された「Cheers!」カードは、単なる記念品ではありません。<br />
            それは、アーティストとあなたを直接つなぐ、パーソナルな接点へと進化します。
          </p>
        </section>

        {/* --- Main Content --- */}
        <div className="grid gap-12">
          
          {/* 目玉機能：直接届く通知 */}
          <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800 relative overflow-hidden group">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-violet-500/10 blur-3xl group-hover:bg-violet-500/20 transition-all" />
            <div className="flex items-start gap-6 relative z-10">
              <div className="bg-violet-500/10 p-4 rounded-2xl shrink-0">
                <Bell className="text-violet-500" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic text-left">ファンへの直接通知（Push Notification）</h2>
                <p className="text-slate-400 leading-relaxed text-left">
                  ウォレットにカードを持つファンだけへ、アーティストから直接メッセージを届けることができます。
                  次回のライブ先行案内や、限定メッセージ、未公開情報の解禁。
                  アプリを立ち上げることなく、あなたのスマホのロック画面へ、特別な「声」が届きます。
                </p>
              </div>
            </div>
          </div>

          {/* 目玉機能：サービス・特典の配布 */}
          <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800 relative overflow-hidden group">
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-pink-500/10 blur-3xl group-hover:bg-pink-500/20 transition-all" />
            <div className="flex items-start gap-6 relative z-10">
              <div className="bg-pink-500/10 p-4 rounded-2xl shrink-0">
                <Gift className="text-pink-500" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic text-left">ライブ後のサプライズ特典配布</h2>
                <p className="text-slate-400 leading-relaxed text-left">
                  ライブ中の応援の証として、後日デジタルギフトやクーポンを「エアドロップ」形式で配布可能。
                  「あの日のライブを共創した仲間」だけに贈られる特別なサービス。
                  一度きりのライブ体験が、終わらない物語へと変わります。
                </p>
              </div>
            </div>
          </div>

          {/* デフォルトの利便性 */}
          <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800">
            <div className="flex items-start gap-6">
              <div className="bg-slate-800 p-4 rounded-2xl shrink-0">
                <Smartphone className="text-slate-400" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic text-left">OS標準の圧倒的な利便性</h2>
                <p className="text-slate-400 leading-relaxed text-left">
                  専用アプリのインストールは不要です。
                  iPhoneやAndroidに最初から入っているウォレットアプリを使用するため、
                  誰でも迷わず、確実に「応援の証」をコレクションし、持ち歩くことができます。
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* --- ADDED: Concept Navigation --- */}
        <section className="mt-32 pt-16 border-t border-slate-900">
          <h2 className="text-xs font-black text-slate-500 tracking-[0.3em] uppercase mb-12 text-center">Explore Other Concepts</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Real-time */}
            <Link href="/app/concept/realtime" className="p-8 rounded-[2rem] border border-slate-800 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-900/60 transition-all group text-left">
              <Zap className="text-slate-600 group-hover:text-pink-400 transition-colors mb-4" size={24} />
              <h3 className="text-xl font-black text-slate-400 group-hover:text-white italic uppercase tracking-tighter transition-colors">Real-time</h3>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">熱狂を瞬時に可視化するフィード</p>
            </Link>

            {/* Wallet (Current) */}
            <div className="p-8 rounded-[2rem] border-2 border-violet-500 bg-violet-500/5 relative overflow-hidden text-left">
              <div className="absolute top-4 right-4 text-[10px] font-black text-violet-500 tracking-widest">YOU ARE HERE</div>
              <Smartphone className="text-violet-500 mb-4" size={24} />
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Wallet Connect</h3>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">誰でも使えるWeb3への入り口</p>
            </div>

            {/* NFT */}
            <Link href="/app/concept/nft" className="p-8 rounded-[2rem] border border-slate-800 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-900/60 transition-all group text-left">
              <Fingerprint className="text-slate-600 group-hover:text-indigo-400 transition-colors mb-4" size={24} />
              <h3 className="text-xl font-black text-slate-400 group-hover:text-white italic uppercase tracking-tighter transition-colors">NFT Assets</h3>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">デジタル資産としての所有権証明</p>
            </Link>
          </div>
        </section>

        {/* --- Footer Note --- */}
        <footer className="mt-20 pt-10 border-t border-slate-900 text-center">
          <p className="text-slate-600 text-sm italic font-mono uppercase tracking-widest">
            A permanent connection in your pocket.
          </p>
        </footer>
      </main>
    </div>
  );
}