'use client';

import React from 'react';
import Link from 'next/link';
import { Award, CheckCircle2, Download, Database, Mail, Smartphone, ArrowLeft, ShieldCheck, ArrowRight } from "lucide-react";

export default function StandardPlanPage() {
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
            <div className="w-8 h-8 rounded bg-pink-500/10 flex items-center justify-center text-pink-500 border border-pink-500/20">
              <Award size={18} />
            </div>
            <span className="text-sm font-black italic uppercase tracking-tighter">Standard Plan</span>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-20">
        {/* --- Hero Section --- */}
        <section className="mb-24 text-center">
          <h1 className="text-5xl md:text-7xl font-black text-white mb-8 italic tracking-tighter uppercase leading-tight">
            Digital<br />Thanks Card
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
            ライブの感動を、あなただけのシリアルナンバーと共に。<br />
            即時発行されるデジタル資産が、支援の証として永遠に残ります。
          </p>
        </section>

        {/* --- Delivery Flow (役務提供の透明性) --- */}
        <section className="mb-24">
          <h2 className="text-xs font-black text-pink-500 uppercase tracking-[0.3em] mb-12 text-center">Delivery & Service Flow</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-[2rem] bg-slate-900/50 border border-slate-800 relative">
              <div className="text-pink-500 mb-6"><Download size={32} /></div>
              <h3 className="text-lg font-bold text-white mb-4 italic">即時ダウンロード</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                決済完了後、ブラウザ上に専用のダウンロードリンクが表示されます。シリアル刻印入りの高精細カードを保存した時点で、**役務提供は完了**します。
              </p>
            </div>
            <div className="p-8 rounded-[2rem] bg-slate-900/50 border border-slate-800">
              <div className="text-indigo-400 mb-6"><Database size={32} /></div>
              <h3 className="text-lg font-bold text-white mb-4 italic">DB永久保持</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                取得したカードは、決済時のメールアドレスと紐づけて当プラットフォームのDBに安全に保管。ログインすることでいつでも再参照可能です。
              </p>
            </div>
            <div className="p-8 rounded-[2rem] bg-slate-900/50 border border-slate-800">
              <div className="text-violet-400 mb-6"><Smartphone size={32} /></div>
              <h3 className="text-lg font-bold text-white mb-4 italic">Wallet 連携</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                スマホの標準ウォレット（Apple Wallet / Google Wallet）へのエクスポートに対応。アプリを開く手間なく、いつでもカードを呼び出せます。
              </p>
            </div>
          </div>
        </section>

        {/* --- Card Identity --- */}
        <section className="mb-24 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-[3rem] p-8 md:p-16 flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 space-y-6">
            <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">唯一無二の証明</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="text-pink-500 mt-1" size={18} />
                <p className="text-slate-300 text-sm font-medium">全カードに固有の**シリアルナンバー**を刻印。</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="text-pink-500 mt-1" size={18} />
                <p className="text-slate-300 text-sm font-medium">アーティストごとの限定デザインを採用。</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="text-pink-500 mt-1" size={18} />
                <p className="text-slate-300 text-sm font-medium">発行日時と会場データがメタデータとして埋め込まれます。</p>
              </div>
            </div>
          </div>
          <div className="flex-1 w-full flex justify-center">
            {/* Card Mockup Image Placeholder */}
            <div className="w-64 h-96 bg-gradient-to-tr from-pink-600 to-violet-600 rounded-2xl shadow-2xl rotate-3 flex flex-col p-6 relative overflow-hidden border border-white/20">
              <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
              <div className="relative z-10">
                <div className="text-[10px] font-black tracking-widest text-white/50 mb-2 uppercase">Official Cheers! Card</div>
                <div className="text-2xl font-black italic text-white mb-8 tracking-tighter leading-none uppercase">Standard<br />Issue</div>
                <div className="mt-40 border-t border-white/20 pt-4">
                  <div className="text-[8px] text-white/50 uppercase font-bold">Serial No.</div>
                  <div className="text-xl font-mono font-black text-white">#DC-004582-Z</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- Compliance Section --- */}
        <section className="py-12 border-t border-slate-900 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-8">
            <ShieldCheck size={14} /> Security & Integrity Guaranteed
          </div>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xl mx-auto">
            当プラットフォームは、実体のない寄付ではなく、明確なデジタルコンテンツの販売および保有権利の管理を行っています。すべての取引は証跡として保存され、不正利用や不正な返金申請に対する防御策を講じています。
          </p>
        </section>

        <div className="flex justify-center mt-12">
          <Link href="/demo" className="bg-white text-slate-950 px-10 py-4 rounded-full font-black text-sm hover:bg-pink-500 hover:text-white transition-all shadow-2xl uppercase tracking-widest flex items-center gap-2">
            体験版でカードを確認する <ArrowRight size={18} />
          </Link>
        </div>
      </main>

      {/* --- Simple Footer --- */}
      <footer className="py-12 border-t border-slate-900 text-center">
        <p className="text-slate-600 text-[10px] font-mono italic uppercase">© 2026 Direct Cheers Platform - Standard Asset Delivery</p>
      </footer>
    </div>
  );
}