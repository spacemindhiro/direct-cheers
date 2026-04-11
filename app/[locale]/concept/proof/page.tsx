import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Fingerprint, History, ArrowLeft, Zap, Wallet, Database } from "lucide-react";

export default function ProofConcept() {
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
          <span className="text-indigo-500 font-black italic tracking-widest text-sm uppercase">Concept 03</span>
          <h1 className="text-5xl md:text-7xl font-black text-white mt-4 mb-8 tracking-tighter italic uppercase leading-[1.1]">
            「支援の記録」を、<br />
            <span className="bg-gradient-to-r from-indigo-500 to-cyan-500 bg-clip-text text-transparent">
              公的な証跡として残す
            </span>
            。
          </h1>
          <p className="text-xl text-slate-400 leading-relaxed font-medium">
            あなたが贈った応援は、単なる一時的なデータではありません。<br />
            決済と連動した厳格なシリアル管理システムにより、その「熱量」は公式な発行ログとして永続的に保存されます。
          </p>
        </section>

        {/* --- Main Content --- */}
        <div className="grid gap-12">
          
          {/* 監査証跡：決済のプロの真骨頂 */}
          <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800 relative overflow-hidden group">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 blur-3xl group-hover:bg-indigo-500/20 transition-all" />
            <div className="flex items-start gap-6 relative z-10">
              <div className="bg-indigo-500/10 p-4 rounded-2xl shrink-0">
                <Database className="text-indigo-500" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic text-left uppercase tracking-tighter">Centralized Trust & Logs</h2>
                <p className="text-slate-400 leading-relaxed text-left">
                  発行される全てのCheers!カードは、プラットフォーム側のセキュアな台帳で一元管理。
                  「いつ、誰が、どのアーティストを応援したか」という決済ログと紐付いた改ざん不能な監査証跡（Audit Trail）を生成し、二重発行や偽造を徹底的に排除します。
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
                <h2 className="text-2xl font-bold text-white mb-4 italic text-left uppercase tracking-tighter">Unique Serial Verification</h2>
                <p className="text-slate-400 leading-relaxed text-left">
                  全ての応援証明書には、発行順に応じた固有のシリアルナンバーを刻印。
                  公式サーバーによる照会システムにより、そのカードが「正当な決済を経て発行された本物」であることを瞬時に証明します。ファンとしての実績が、確かな信頼を伴う価値になります。
                </p>
              </div>
            </div>
          </div>

          {/* データの保全性 */}
          <div className="bg-slate-900/50 p-10 rounded-[2.5rem] border border-slate-800">
            <div className="flex items-start gap-6">
              <div className="bg-slate-800 p-4 rounded-2xl shrink-0">
                <History className="text-slate-400" size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 italic text-left uppercase tracking-tighter">Data Integrity</h2>
                <p className="text-slate-400 leading-relaxed text-left">
                  詳細な応援履歴は、金融機関レベルのデータ保全性を備えたデータベースで保護。
                  一方で、ユーザーが手にするWalletパスには「所有の事実」のみをエクスポートすることで、プライバシーを確保しながら、デジタルアセットとしての利便性を最大化しています。
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* --- Concept Navigation --- */}
        <section className="mt-32 pt-16 border-t border-slate-900">
          <h2 className="text-xs font-black text-slate-500 tracking-[0.3em] uppercase mb-12 text-center">Explore Other Concepts</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Real-time */}
            <Link href="/concept/realtime" className="p-8 rounded-[2rem] border border-slate-800 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-900/60 transition-all group">
              <Zap className="text-slate-600 group-hover:text-yellow-400 transition-colors mb-4" size={24} />
              <h3 className="text-xl font-black text-slate-400 group-hover:text-white italic uppercase tracking-tighter transition-colors">Real-time</h3>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">01 リアルタイム演出連動</p>
            </Link>

            {/* Wallet */}
            <Link href="/concept/wallet" className="p-8 rounded-[2rem] border border-slate-800 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-900/60 transition-all group">
              <Wallet className="text-slate-600 group-hover:text-cyan-400 transition-colors mb-4" size={24} />
              <h3 className="text-xl font-black text-slate-400 group-hover:text-white italic uppercase tracking-tighter transition-colors">Wallet</h3>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">02 スマホのウォレットに保存</p>
            </Link>

            {/* Proof (Current) */}
            <div className="p-8 rounded-[2rem] border-2 border-indigo-500 bg-indigo-500/5 relative overflow-hidden">
              <div className="absolute top-4 right-4 text-[10px] font-black text-indigo-500 tracking-widest uppercase">You are here</div>
              <ShieldCheck className="text-indigo-500 mb-4" size={24} />
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Digital Proof</h3>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed">03 シリアルナンバー証跡管理</p>
            </div>

          </div>
        </section>

        {/* --- Footer Note --- */}
        <footer className="mt-20 pt-10 border-t border-slate-900 text-center">
          <p className="text-slate-600 text-sm italic font-mono uppercase tracking-widest">
            Identity verified by Direct Cheers secure logs.
          </p>
        </footer>
      </main>
    </div>
  );
}