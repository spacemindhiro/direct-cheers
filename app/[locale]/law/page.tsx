import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LawTable } from "@/components/legal/law-document";

export default function LawPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      <nav className="p-6 pt-[calc(1.5rem_+_env(safe-area-inset-top))] border-b border-slate-800 backdrop-blur-md bg-slate-950/80 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold hover:text-pink-500 transition-colors group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> BACK TO TOP
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-black italic tracking-tighter text-slate-500 uppercase">
            Legal Compliance
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto py-20 px-6">
        <section className="mb-16 text-center">
          <div className="inline-block p-3 bg-pink-500/10 rounded-2xl mb-6">
            <ShieldCheck className="text-pink-500" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tighter italic uppercase">
            特定商取引法に基づく表記
          </h1>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">
            Specified Commercial Transactions Act
          </p>
        </section>

        <LawTable />

        <footer className="mt-16 pt-10 border-t border-slate-900 text-center">
          <p className="text-slate-600 text-[11px] font-mono italic leading-relaxed mb-4">
            本プラットフォームは、SpaceMind Direct Cheers 事務局が運営し、<br />
            アーティストへの直接支援を技術的に担保するデジタルアセット発行サービスです。
          </p>
          <div className="text-[10px] text-slate-700 font-bold tracking-widest uppercase">
            Platform ver 1.0.4 - 2026 Edition
          </div>
        </footer>
      </main>
    </div>
  );
}