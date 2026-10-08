import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock } from "lucide-react";
import { PrivacySections, PRIVACY_LAST_UPDATED } from "@/components/legal/privacy-document";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      <nav className="p-6 pt-[calc(1.5rem_+_env(safe-area-inset-top))] border-b border-slate-800 sticky top-0 bg-slate-950/80 backdrop-blur-md z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold hover:text-pink-500 transition-colors group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> BACK TO TOP
          </Link>
          <div className="text-[10px] font-black italic text-slate-500 uppercase tracking-widest">Privacy Policy</div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto py-20 px-6">
        <section className="mb-16 text-center">
          <div className="inline-block p-4 bg-gradient-to-br from-violet-500/20 to-pink-500/20 rounded-3xl mb-6 border border-violet-500/20">
            <Lock className="text-violet-500" size={40} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tighter italic uppercase">
            プライバシーポリシー
          </h1>
          <p className="text-slate-500 text-sm font-medium italic">Data Protection & User Privacy</p>
        </section>

        <PrivacySections />

        <footer className="mt-20 pt-10 border-t border-slate-900 text-center">
          <p className="text-slate-600 text-[10px] font-mono italic">
            Last Updated: {PRIVACY_LAST_UPDATED}
          </p>
        </footer>
      </main>
    </div>
  );
}