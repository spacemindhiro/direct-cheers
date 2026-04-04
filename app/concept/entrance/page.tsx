'use client';

import React from 'react';
import Link from 'next/link';
import { Ticket, CheckCircle2, QrCode, ArrowLeft, ShieldCheck, ArrowRight, AlertTriangle, UserCheck } from "lucide-react";

export default function EntrancePlanPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      <nav className="border-b border-slate-800 px-6 py-6">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
            <span className="text-xs font-bold tracking-widest uppercase">Back to Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <Ticket size={18} />
            </div>
            <span className="text-sm font-black italic uppercase tracking-tighter">Entrance Plan</span>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-20">
        <section className="mb-24 text-center">
          <h1 className="text-5xl md:text-7xl font-black text-white mb-8 italic tracking-tighter uppercase leading-tight">
            Digital Access Pass
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium text-pretty">
            スマートな入場体験と、確実な権利譲渡。特定の会場への入場を許可する、デジタル専用アクセス権。
          </p>
        </section>

        <section className="mb-24 grid md:grid-cols-2 gap-8 text-pretty">
          <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 relative group overflow-hidden">
            <div className="text-indigo-400 mb-6"><QrCode size={40} /></div>
            <h3 className="text-2xl font-bold text-white mb-4 italic uppercase">ユニークQRコード発行</h3>
            <p className="text-sm text-slate-400 leading-relaxed font-medium">
              決済完了後、即座に入場用QRコードが発行されます。この生成をもって役務提供完了となります。
            </p>
          </div>
          <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 relative group overflow-hidden">
            <div className="text-amber-500 mb-6"><UserCheck size={40} /></div>
            <h3 className="text-2xl font-bold text-white mb-4 italic uppercase">転売防止・本人認証</h3>
            <p className="text-sm text-slate-400 leading-relaxed font-medium">
              アクセス権はユーザーのメールアドレスに紐付けられ、安全な興行運営をサポートします。
            </p>
          </div>
        </section>

        <section className="mb-24 relative text-pretty">
          <div className="p-8 md:p-12 bg-slate-900/40 border-2 border-amber-500/20 rounded-[3rem]">
            <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-8 flex items-center gap-3">
              <AlertTriangle className="text-amber-500" size={28} /> 免責事項
            </h2>
            <div className="space-y-6">
              <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                <h4 className="text-amber-500 font-black text-xs uppercase tracking-widest mb-3">No-Show (無断欠席) について</h4>
                <p className="text-sm text-slate-300 leading-relaxed font-medium">
                  お客様都合によりイベントに参加できなかった場合、権利の未行使による返金には一切応じられません。デジタルパスが発行された時点で「入場する権利」の譲渡は完了しております。
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-center">
          <Link href="/demo" className="bg-white text-slate-950 px-10 py-4 rounded-full font-black text-sm hover:bg-indigo-600 hover:text-white transition-all shadow-2xl uppercase tracking-widest flex items-center gap-2">
            体験版を見る <ArrowRight size={18} />
          </Link>
        </div>
      </main>
    </div>
  );
}