'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Ticket, CheckCircle2, QrCode, ArrowLeft, ShieldCheck, 
  ArrowRight, AlertTriangle, UserCheck, Smartphone, 
  Award, MessageSquare, Construction, ChevronRight, Scale
} from "lucide-react";

export default function EntrancePlanPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30 overflow-x-hidden text-left">
      {/* --- Header --- */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4 text-left">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
            <span className="text-xs font-bold tracking-widest uppercase">Back to Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <Ticket size={18} />
            </div>
            <span className="text-sm font-black italic uppercase tracking-tighter text-white">Entrance Plan</span>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto pt-24 pb-20 px-6 relative">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/10 blur-[120px] rounded-full -z-10" />

        {/* --- Hero Section --- */}
        <section className="grid md:grid-cols-2 gap-16 items-center mb-24">
          <div className="space-y-8 text-left text-pretty">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20"><QrCode size={24} /></div>
              <span className="text-sm font-black italic uppercase tracking-tighter text-indigo-400">Digital Access Pass</span>
            </div>
            <h2 className="text-5xl md:text-7xl font-black text-white italic tracking-tighter uppercase leading-[1.1]">
              スムーズな入場を、<br /><span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">デジタルで証明。</span>
            </h2>
            <p className="text-lg text-slate-400 leading-relaxed font-medium">
              特定の会場やイベントへの入場権利をデジタル化。Apple/Google Walletへの格納に対応し、QRコードによる認証、またはスタッフによる目視確認でスマートな受付を実現します。
            </p>
            <p className="text-indigo-400 font-bold text-sm tracking-widest uppercase">
              [ 料金体系：¥50〜¥30,000 (税込) ]
            </p>
          </div>
          
          {/* Ticket Visual */}
          <div className="flex justify-center relative group">
            <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="w-64 h-96 bg-gradient-to-br from-slate-900 to-indigo-950 rounded-[2rem] shadow-2xl rotate-3 flex flex-col p-6 relative overflow-hidden border border-indigo-500/30 transition-transform group-hover:rotate-0 group-hover:scale-105 duration-500 font-sans">
              <div className="relative z-10 flex flex-col h-full items-center text-center">
                <div className="text-[10px] font-black tracking-[0.2em] text-indigo-400 mb-6 uppercase">Event Pass</div>
                <div className="w-40 h-40 bg-white p-3 rounded-2xl mb-6 shadow-xl flex items-center justify-center">
                   <QrCode className="w-full h-full text-slate-900 p-2" />
                </div>
                <div className="text-xl font-black italic text-white tracking-tighter leading-tight uppercase mb-2">ACCESS<br />GRANTED</div>
                <div className="mt-auto w-full border-t border-white/10 pt-4">
                   <div className="text-[8px] text-white/40 uppercase font-bold tracking-widest mb-1 text-left">Serial No.</div>
                   <div className="text-lg font-mono font-black text-white tracking-tighter text-left uppercase">ENT-8829-X</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- Pricing Control & Safety --- */}
        <section className="mb-24 p-10 rounded-[3rem] bg-indigo-500/5 border border-indigo-500/20 relative overflow-hidden">
          <div className="flex flex-col md:flex-row gap-10 items-start md:items-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
              <Scale size={32} />
            </div>
            <div className="space-y-4">
              <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">価格妥当性の厳格な審査</h3>
              <p className="text-slate-400 leading-relaxed font-medium">
                当プラットフォームでは、イベントオーガナイザーが設定する入場価格がイベントの実態（会場規模、内容、提供価値）に対して適正であるか、運営エージェントが事前に全件審査を行っています。
                社会通念上、不当に高額な価格設定や、実体の伴わない決済を未然に防ぎ、健全な取引を担保しています。
              </p>
            </div>
          </div>
        </section>
{/* --- Event Verification & Refund Policy --- */}
<section className="mb-24 p-10 rounded-[3rem] bg-rose-500/5 border border-rose-500/20 relative overflow-hidden">
  <div className="flex flex-col md:flex-row gap-10 items-start md:items-center">
    <div className="w-16 h-16 rounded-2xl bg-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
      <CheckCircle2 size={32} />
    </div>
    <div className="space-y-4 text-left">
      <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter text-rose-400">イベント開催実態の確認</h3>
      <p className="text-slate-400 leading-relaxed font-medium">
        当サービスではイベントの開催実態の報告をイベントオーガナイザーに義務付けています。エージェントは、チケット販売対象となるイベントの開催実態を厳格に確認します。
        <span className="text-rose-400 font-bold ml-1">実体のない「空イベント」による販売は固く禁じられており、万が一イベント自体が中止、または実体がないと判断された場合、支払われた金額は全額払い戻し処理が行われます。</span>
      </p>
    </div>
  </div>
</section>
        {/* --- Core Features --- */}
        <section className="grid md:grid-cols-3 gap-8 mb-24 text-left">
          <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 hover:border-indigo-500/30 transition-colors">
            <div className="text-indigo-400 mb-6"><QrCode size={32} /></div>
            <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter leading-tight">ユニークQR発行</h3>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">
              発行パスのQRコード読取りを行う場合、時限性のあるQRコード生成により、セキュリティを強化することが可能。会場での不正コピーや転売を防止します。
            </p>
          </div>

          <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 transition-colors text-left">
            <div className="text-cyan-400 mb-6"><Smartphone size={32} /></div>
            <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter leading-tight">Apple/Google Wallet</h3>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">
              発行されたパスはスマートフォンのWalletアプリに格納可能。会場入口で素早く提示・スキャンが可能です。
            </p>
          </div>

          <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 hover:border-amber-500/30 transition-colors text-left">
            <div className="text-amber-500 mb-6"><UserCheck size={32} /></div>
            <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter leading-tight">柔軟な認証方式</h3>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">
              専用アプリによるQRコードスキャンのみではなく、スタッフによる画面目視確認運用も可能。あらゆる現場環境にフィットします。
            </p>
          </div>
        </section>

        {/* --- Compliance & Service Policy --- */}
        <section className="mb-32 p-8 md:p-12 bg-slate-900/30 border border-slate-800 rounded-[3rem] relative overflow-hidden text-left text-pretty">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <h2 className="text-xl font-black text-white italic uppercase tracking-tighter mb-8 flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={24} /> 役務提供の完了と免責
          </h2>
          <div className="grid md:grid-cols-2 gap-10 text-sm text-slate-400">
            <div className="space-y-4">
              <h4 className="text-white font-bold uppercase tracking-widest text-[10px]">役務提供の定義</h4>
              <p className="leading-relaxed font-medium">
                ユーザーが決済を完了し、ブラウザ上でのデジタルパス表示、または決済に使用したメールアドレスに紐付けたデータベースへの入場権利の格納が完了した時点で、本サービスの役務提供は100%完了したものとみなされます。
              </p>
            </div>
            <div className="space-y-4">
              <h4 className="text-white font-bold uppercase tracking-widest text-[10px]">No-Show (未利用) への対応</h4>
              <p className="leading-relaxed font-medium text-xs">
                お客様の都合（遅延、体調不良、忘却等）により会場での提示が行われなかった場合でも、既に「入場権利」自体は提供済みであるため、返金・キャンセルの対象外となります。
              </p>
            </div>
          </div>
        </section>

        {/* --- 他のプラン (Messageプランの最新価格 ¥2,000 / ¥5,000 を反映) --- */}
        <div className="pt-24 border-t border-slate-900 text-center">
          <h3 className="text-white font-black italic tracking-tighter text-2xl mb-12 uppercase leading-none">Explore Other Plans</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
            
            {/* Standard */}
            <Link href="/concept/standard" className="relative p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-pink-500/50 transition-all text-left overflow-hidden">
              <div className="absolute top-0 right-0 z-10 px-5 py-1.5 bg-green-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Auto Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-pink-500 border border-slate-700 group-hover:bg-pink-500/10 transition-colors"><Award size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Standard</h4>
              </div>
              <div className="mb-8 leading-none">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1 text-left">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter leading-tight">¥1,000</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest text-left">上限：¥3,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium font-sans">
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-pink-500 shrink-0" /> デジタル応援証明書の発行</li>
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-pink-500 shrink-0" /> Wallet / コレクション管理</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-pink-400 transition-colors font-bold"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span><ChevronRight size={16} /></div>
            </Link>

            {/* Message */}
            <Link href="/concept/message" className="relative p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-violet-500/50 transition-all text-left overflow-hidden">
              <div className="absolute top-0 right-0 z-10 px-5 py-1.5 bg-violet-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Auto Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-violet-400 border border-slate-700 group-hover:bg-violet-500/10 transition-colors"><MessageSquare size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Message</h4>
              </div>
              <div className="mb-8 leading-none">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1 text-left">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter leading-tight">¥2,000</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest text-left">上限：¥5,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium font-sans">
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-violet-400 shrink-0" /> アーティスト閲覧用メッセージ</li>
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-violet-400 shrink-0" /> 内容記録型デジタル証明書</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-violet-400 transition-colors font-bold"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span><ChevronRight size={16} /></div>
            </Link>

            {/* Custom */}
            <Link href="/concept/custom" className="relative p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-amber-500/50 transition-all text-left overflow-hidden">
              <div className="absolute top-0 right-0 z-10 px-5 py-1.5 bg-amber-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Manual Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-amber-500 border border-slate-700 group-hover:bg-amber-500/10 transition-colors"><Construction size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Custom</h4>
              </div>
              <div className="mb-8 leading-none text-left">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter leading-tight">¥10,000</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest text-left">上限：¥100,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium font-sans">
                <li className="flex items-center gap-2.5 font-bold"><ShieldCheck size={16} className="text-amber-500 shrink-0" /> 内容に応じた個別役務</li>
                <li className="flex items-center gap-2.5 font-bold"><ShieldCheck size={16} className="text-amber-500 shrink-0" /> 完了エビデンスの事前定義</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-amber-400 transition-colors font-bold"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span><ChevronRight size={16} /></div>
            </Link>
          </div>
        </div>
      </main>

      <footer className="py-12 border-t border-slate-800 bg-slate-950 text-center font-sans">
        <p className="text-slate-600 text-[10px] font-mono italic">© 2026 Direct Cheers Platform.</p>
      </footer>
    </div>
  );
}