import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Fingerprint, Share2, ArrowLeft, Zap, Wallet } from "lucide-react";

export default function NftConcept() {
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
          <span className="text-indigo-500 font-black italic tracking-widest text-sm uppercase">Concept 03</span>
          <h1 className="text-5xl md:text-7xl font-black text-white mt-4 mb-8 tracking-tighter italic uppercase leading-[1.1]">
            「持っている」を、<br />
            <span className="bg-gradient-to-r from-indigo-500 to-cyan-500 bg-clip-text text-transparent">
              永遠に証明する
            </span>
            。
          </h1>
          <p className="text-xl text-slate-400 leading-relaxed font-medium">
            あなたが手に入れたデジタルカードは、コピー可能なデータではありません。<br />
            ブロックチェーン技術（NFT）により、その所有権は世界でただ一つのものとして記録されます。
          </p>
        </section>

        {/* --- Main Content --- */}
        <div className="grid gap-12">
          
          {/* 所有権の証明：ここがNFTの役割 */}
          <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800 relative overflow-hidden group">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 blur-3xl group-hover:bg-indigo-500/20 transition-all" />
            <div className="flex items-start gap-6 relative z-10">
              <div className="bg-indigo-500/10 p-4 rounded-2xl shrink-0">
                <Fingerprint className="text-indigo-500" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic text-left">デジタル資産としての所有権担保</h2>
                <p className="text-slate-400 leading-relaxed text-left">
                  発行される全てのデジタルCheers!カードには、ブロックチェーン上に固有のIDと所有者情報が刻まれます。
                  たとえサービスが形を変えても、あなたが「あの日のあのライブで、このカードを手に入れた」という事実は、誰にも書き換えられないデジタルな証跡として残り続けます。
                </p>
              </div>
            </div>
          </div>

          {/* シリアルナンバーの価値 */}
          <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800 relative overflow-hidden group">
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-cyan-500/10 blur-3xl group-hover:bg-cyan-500/20 transition-all" />
            <div className="flex items-start gap-6 relative z-10">
              <div className="bg-cyan-500/10 p-4 rounded-2xl shrink-0">
                <ShieldCheck className="text-cyan-500" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic text-left">偽造不可能なシリアルナンバー</h2>
                <p className="text-slate-400 leading-relaxed text-left">
                  全てのカードには、発行順に応じたシリアルナンバーが刻印されます。
                  ブロックチェーンによる検証システムにより、そのカードが公式に発行された本物であることを、誰でも瞬時に確認可能。
                  ファンとしての「熱量」が、客観的な信頼を伴う価値へと変わります。
                </p>
              </div>
            </div>
          </div>

          {/* 応援履歴との違い（内部DB） */}
          <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800">
            <div className="flex items-start gap-6">
              <div className="bg-slate-800 p-4 rounded-2xl shrink-0">
                <Share2 className="text-slate-400" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic text-left">プライバシーと利便性の両立</h2>
                <p className="text-slate-400 leading-relaxed text-left">
                  個別の「いつ、どのタイミングで応援したか」という詳細なアクション履歴は、プラットフォーム内部のセキュアなデータベースで厳重に管理。
                  表舞台（ブロックチェーン）には「カードの所有権」という確固たる事実のみを公開することで、プライバシーを守りながら次世代のファン体験を支えます。
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* --- ADDED: Concept Navigation --- */}
        <section className="mt-32 pt-16 border-t border-slate-900">
          <h2 className="text-xs font-black text-slate-500 tracking-[0.3em] uppercase mb-12 text-center">Explore Other Concepts</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* NFT (Current) */}
            <div className="p-8 rounded-[2rem] border-2 border-indigo-500 bg-indigo-500/5 relative overflow-hidden">
              <div className="absolute top-4 right-4 text-[10px] font-black text-indigo-500 tracking-widest">YOU ARE HERE</div>
              <Fingerprint className="text-indigo-500 mb-4" size={24} />
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">NFT Assets</h3>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">デジタル資産としての所有権証明</p>
            </div>

            {/* Real-time */}
            <Link href="/concept/realtime" className="p-8 rounded-[2rem] border border-slate-800 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-900/60 transition-all group">
              <Zap className="text-slate-600 group-hover:text-yellow-400 transition-colors mb-4" size={24} />
              <h3 className="text-xl font-black text-slate-400 group-hover:text-white italic uppercase tracking-tighter transition-colors">Real-time</h3>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">熱狂を瞬時に可視化するフィード</p>
            </Link>

            {/* Wallet */}
            <Link href="/concept/wallet" className="p-8 rounded-[2rem] border border-slate-800 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-900/60 transition-all group">
              <Wallet className="text-slate-600 group-hover:text-cyan-400 transition-colors mb-4" size={24} />
              <h3 className="text-xl font-black text-slate-400 group-hover:text-white italic uppercase tracking-tighter transition-colors">Wallet</h3>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">誰でも使えるWeb3への入り口</p>
            </Link>
          </div>
        </section>

        {/* --- Footer Note --- */}
        <footer className="mt-20 pt-10 border-t border-slate-900 text-center">
          <p className="text-slate-600 text-sm italic font-mono uppercase tracking-widest">
            Ownership verified on the blockchain.
          </p>
        </footer>
      </main>
    </div>
  );
}