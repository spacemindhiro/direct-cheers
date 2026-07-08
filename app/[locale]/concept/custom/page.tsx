'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Construction, CheckCircle2, ShieldCheck, ArrowLeft, 
  Camera, FileSearch, MessageSquare, Award, Sparkles, 
  Zap, Scale, ChevronRight, Ticket, Video, Mic2, Star, Eye
} from "lucide-react";

export default function CustomPlanPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-amber-500/30 overflow-x-hidden text-left">
      {/* --- Header --- */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4 text-left">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
            <span className="text-xs font-bold tracking-widest uppercase">Back to Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
              <Construction size={18} />
            </div>
            <span className="text-sm font-black italic uppercase tracking-tighter text-white">Custom Plan</span>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto pt-24 pb-20 px-6 relative text-left">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-500/5 blur-[120px] rounded-full -z-10" />

        {/* --- Hero Section --- */}
        <section className="grid md:grid-cols-2 gap-16 items-center mb-28">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
                <Sparkles size={24} />
              </div>
              <span className="text-sm font-black italic uppercase tracking-tighter text-amber-500">Co-Creation & Governance</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-white italic tracking-tighter uppercase leading-[1.1]">
              アイデアを、<br /><span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">価値ある資産へ。</span>
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed font-medium">
              固定概念に縛られない、アーティスト独自の「体験」をデジタルカードと共にパッケージ化。担当エージェントが企画段階から介入し、客観的な証拠（エビデンス）を伴う透明性の高い高付加価値取引を実現します。
            </p>
            <p className="text-amber-500 font-bold text-sm tracking-widest uppercase">
              [ 推奨単価：¥10,000〜¥100,000 (税込) ]
            </p>
          </div>

          {/* Card Visual with Plus Value context */}
          <div className="flex justify-center relative group">
            <div className="absolute inset-0 bg-amber-500/10 blur-3xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="w-64 h-96 bg-gradient-to-tr from-slate-900 via-amber-950 to-orange-950 rounded-3xl shadow-2xl rotate-2 flex flex-col p-7 relative overflow-hidden border-2 border-amber-500/40 transition-transform group-hover:rotate-0 group-hover:scale-105 duration-500 text-left">
              <div className="absolute inset-0 opacity-15 bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')]" />
              <div className="relative z-10 flex flex-col h-full font-sans">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-[10px] font-black tracking-widest text-amber-300 uppercase italic">Special Bundle</div>
                  <Star className="text-amber-400 fill-amber-400" size={14}/>
                </div>
                <div className="text-2xl font-black italic text-white mb-6 tracking-tighter leading-none uppercase">PREMIUM<br />ASSET</div>
                
                <div className="flex-1 bg-black/30 rounded-xl p-3 border border-amber-500/20 space-y-2 overflow-hidden">
                  <div className="text-[8px] text-amber-300 uppercase font-bold tracking-tighter">Included Value</div>
                  <div className="flex items-center gap-2 text-[10px] text-white/90 italic font-medium">
                    <CheckCircle2 size={12} className="text-amber-400"/>
                    客観的な完了エビデンス
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-white/90 italic font-medium leading-tight">
                    <CheckCircle2 size={12} className="text-amber-400"/>
                    企画固有の体験・データ
                  </div>
                </div>

                <div className="border-t border-amber-500/20 pt-4 mt-4">
                  <div className="text-[8px] text-white/60 uppercase font-bold tracking-widest">Bundle ID</div>
                  <div className="text-xl font-mono font-black text-white tracking-tighter">#CS-771004-P</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- Value Examples --- */}
        <section className="mb-24">
          <h2 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] mb-12 text-center">Value Creation Examples</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-emerald-500/30 hover:border-emerald-500/60 transition-colors">
              <span className="inline-block mb-6 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-widest">標準メニュー</span>
              <div className="text-emerald-500 mb-6"><Ticket size={32} /></div>
              <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter leading-tight">バウチャー（引換券）</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">
                会場でのグッズ・特典引換に使える、1回のみ使用可能なデジタル引換コード。未使用分はイベント終了後に自動返金されます。
              </p>
            </div>
            <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 hover:border-amber-500/30 transition-colors">
              <span className="inline-block mb-6 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[9px] font-black uppercase tracking-widest">要相談・都度開発</span>
              <div className="text-amber-500 mb-6"><Video size={32} /></div>
              <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter leading-tight">パーソナルビデオ提供</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">
                支援者の名前を含めた個別のメッセージ動画を撮影。その動画データそのもの、あるいは閲覧権利を紐付けた限定カードを発行します。
              </p>
            </div>
            <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 hover:border-amber-500/30 transition-colors">
              <span className="inline-block mb-6 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[9px] font-black uppercase tracking-widest">要相談・都度開発</span>
              <div className="text-amber-500 mb-6"><Mic2 size={32} /></div>
              <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter leading-tight">一点物の音声・音源</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">
                特定のシチュエーションのために録り下ろした未発表音源やボイスメッセージ。発行時点で唯一無二の価値を封入します。
              </p>
            </div>
            <div className="p-10 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 hover:border-amber-500/30 transition-colors">
              <span className="inline-block mb-6 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[9px] font-black uppercase tracking-widest">要相談・都度開発</span>
              <div className="text-amber-500 mb-6"><Camera size={32} /></div>
              <h3 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter leading-tight">現場エビデンス保持</h3>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">
                応援広告や楽屋花の設置記録をシリアルナンバーと共にカード化。役務が確実に実行された証拠を資産として提供します。
              </p>
            </div>
          </div>
          <p className="text-slate-600 text-xs text-center mt-10 font-medium">
            バウチャー以外の企画は個別のご相談内容に応じて都度開発いたします。エージェントが企画段階から伴走します。
          </p>
        </section>

        {/* --- Governance Section --- */}
        <section className="mb-32 p-8 md:p-12 bg-slate-900/30 border border-slate-800 rounded-[3rem] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <h2 className="text-xl font-black text-white italic uppercase tracking-tighter mb-8 flex items-center gap-2">
            <Scale className="text-amber-500" size={24} /> 透明性の確保
          </h2>
          <div className="grid md:grid-cols-2 gap-10 text-sm text-slate-400">
            <div className="space-y-4">
              <h4 className="text-white font-bold uppercase tracking-widest text-[10px]">客観的な記録義務</h4>
              <p className="leading-relaxed font-medium">
                本プランでは、提供される役務が確実に実行されたことを示すデータ（写真、動画、ログデータ、配送記録など）をエビデンスとして保持することを義務付けています。
              </p>
            </div>
            <div className="space-y-4">
              <h4 className="text-white font-bold uppercase tracking-widest text-[10px]">不当な資金移動の防止</h4>
              <p className="leading-relaxed font-medium">
                設定価格が提供役務に対して著しく乖離していないか、エージェントが事前審査。実体のない「空取引」や不当な高額取引を未然に防ぎます。
              </p>
            </div>
          </div>
        </section>

        {/* --- Explore Other Plans --- */}
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
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter leading-tight">¥1,000</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">上限：¥3,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium">
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-pink-500 shrink-0" /> デジタル応援証明書の発行</li>
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-pink-500 shrink-0" /> Wallet / コレクション管理</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-pink-400 transition-colors font-bold"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span><ChevronRight size={16} /></div>
            </Link>

            {/* Message */}
            <Link href="/concept/message" className="relative p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-violet-500/50 transition-all text-left overflow-hidden">
              <div className="absolute top-0 right-0 z-10 px-5 py-1.5 bg-green-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Auto Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-violet-400 border border-slate-700 group-hover:bg-violet-500/10 transition-colors"><MessageSquare size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Message</h4>
              </div>
              <div className="mb-8 leading-none">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter leading-tight">¥2,000</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">上限：¥5,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium">
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-violet-400 shrink-0" /> アーティスト閲覧用メッセージ</li>
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-violet-400 shrink-0" /> 内容記録型デジタル証明書</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-violet-400 transition-colors font-bold"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span><ChevronRight size={16} /></div>
            </Link>

            {/* Entrance (Review Process) */}
            <Link href="/concept/entrance" className="relative p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-indigo-500/50 transition-all text-left overflow-hidden">
              <div className="absolute top-0 right-0 z-10 px-5 py-1.5 bg-indigo-600/80 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg flex items-center gap-1">
                 Review Required
              </div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-indigo-400 border border-slate-700 group-hover:bg-indigo-500/10 transition-colors"><Ticket size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Entrance</h4>
              </div>
              <div className="mb-8 leading-none">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter leading-tight">¥5,000</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">上限：¥30,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium">
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-indigo-400 shrink-0" /> デジタル入場権利の発行</li>
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-indigo-400 shrink-0" /> エージェントによる価格適正審査</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-indigo-400 transition-colors font-bold"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span><ChevronRight size={16} /></div>
            </Link>

          </div>
        </div>
      </main>

      <footer className="py-12 border-t border-slate-800 bg-slate-950 text-center font-sans">
        <p className="text-slate-600 text-[10px] font-mono italic">© 2026 Direct Cheers Platform - High-Value Transaction Governance</p>
      </footer>
    </div>
  );
}