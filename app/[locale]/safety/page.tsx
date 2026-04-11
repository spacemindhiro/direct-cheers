'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, UserCheck, FileSearch, CheckCircle2, Lock, ArrowLeft, Mail, ShieldAlert } from "lucide-react";

export default function SafetyPage() {
  const contactEmail = "support@direct-cheers.com";
  const contactSubject = encodeURIComponent("【Direct Cheers】安全性に関するお問い合わせ");
  const mailUrl = `mailto:${contactEmail}?subject=${contactSubject}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30 overflow-x-hidden">
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
          <Link href="/" className="text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase">
            <ArrowLeft size={14} /> Back to Home
          </Link>
        </div>
      </nav>

      {/* --- Hero Section --- */}
      <section className="relative py-20 px-6 overflow-hidden border-b border-slate-900">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/10 blur-[120px] rounded-full -z-10" />
        
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-4 py-1.5 rounded-full border border-indigo-500/30 text-indigo-400 text-[10px] font-bold tracking-[0.2em] uppercase mb-8 bg-indigo-500/5">
            Trust & Governance
          </span>
          <h2 className="text-4xl md:text-6xl font-black mb-8 tracking-tighter text-white leading-tight uppercase italic">
            安心・安全への<br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">
              「徹底した取り組み」
            </span>
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
            Direct Cheersは、25年の金融システム開発キャリアに基づく設計思想により、<br />
            日本の法令を遵守し、アーティストとファンの信頼を守るための厳格なガバナンス体制を構築しています。
          </p>
        </div>
      </section>

      {/* --- 3-Step Verification Grid --- */}
      <section className="py-24 px-6 relative border-b border-slate-900">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <UserCheck size={32} />,
                title: "連結アカウント審査",
                desc: "全加盟店（オーガナイザー・DJ）に対し、KYC（本人確認）と活動実績の審査を実施。プラットフォームによる事前承認が決済の必須条件です。",
                label: "Step 01"
              },
              {
                icon: <FileSearch size={32} />,
                title: "対価の正当性審査",
                desc: "提供される「Cheers!カード」の価値と決済額が妥当であるかを運営が個別に審査。承認されないアイテムでの決済はシステムで遮断されます。",
                label: "Step 02"
              },
              {
                icon: <CheckCircle2 size={32} />,
                title: "イベント開催確認",
                desc: "イベント終了後、実施を証明するエビデンス（写真・記録）を照合。運営が開催を確認するまで売上の引き出し権限をロックします。",
                label: "Step 03"
              }
            ].map((item, i) => (
              <div key={i} className="p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 hover:border-indigo-500/50 transition-all group">
                <div className="text-indigo-500 mb-6 group-hover:scale-110 transition-transform origin-left">{item.icon}</div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">{item.label}</span>
                <h3 className="text-xl font-bold text-white mb-4 italic uppercase tracking-tighter">{item.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed font-medium">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Risk Management --- */}
      <section className="py-24 px-6 bg-slate-950 relative overflow-hidden">
        <div className="max-w-5xl mx-auto">
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-8 md:p-16 rounded-[3.5rem] relative group overflow-hidden">
            <div className="absolute -right-20 -top-20 w-80 h-80 bg-indigo-500/5 blur-[100px] rounded-full" />
            
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-tight">
                  資金移動の透明性と<br />
                  <span className="text-pink-500 text-4xl">リスクヘッジ</span>
                </h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-pink-500/10 rounded-lg text-pink-500"><ShieldAlert size={20} /></div>
                    <div>
                      <h4 className="text-white font-bold text-sm italic uppercase">Chargeback Buffer</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">不適切な取引や不正利用リスクを最小化するため、決済完了から出金可能になるまで最短2週間の待機期間を設けています。</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500"><Lock size={20} /></div>
                    <div>
                      <h4 className="text-white font-bold text-sm italic uppercase">Full Transaction Log Audit</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">Stripeの決済ログとシステム内部DBの取引ログを全件、1円単位で自動照合。完全に整合性が取れた取引のみを出金対象として扱います。</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-8 rounded-3xl space-y-6">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Revenue Distribution</h4>
                <ul className="space-y-4 text-sm font-bold italic tracking-tighter uppercase">
                  <li className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Merchant Payout</span>
                    <span className="text-white">86.4%</span>
                  </li>
                  <li className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-500 font-medium">Platform Fee</span>
                    <span className="text-slate-400">10.0%</span>
                  </li>
                  <li className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-500 font-medium">Stripe Processing</span>
                    <span className="text-slate-400">3.6%</span>
                  </li>
                </ul>
                <div className="bg-indigo-500/5 p-4 rounded-xl border border-indigo-500/20">
                  <p className="text-[10px] text-indigo-400 font-medium leading-relaxed">
                    ※ 本プラットフォームは「寄付」ではなく、デジタルアイテムの販売代行として取引の適正性を管理しています。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Footer --- */}
      <footer className="py-12 px-6 border-t border-slate-900 bg-slate-950 text-center">
        <p className="text-slate-600 text-[10px] font-mono italic mb-4">© 2026 Direct Cheers Platform Safety Policy.</p>
        <a 
          href={mailUrl}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest"
        >
          <Mail size={14} /> セキュリティ・信頼性に関するお問い合わせ
        </a>
      </footer>
    </div>
  );
}