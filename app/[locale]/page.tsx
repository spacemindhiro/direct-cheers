'use client';

import React from 'react';
import Link from 'next/link';
import {
  Play,
  Wallet,
  ShieldCheck,
  Zap,
  ArrowRight,
  Award,
  Database,
  Music,
  Smartphone,
  CheckCircle2,
  Construction,
  BellDot,
  Ticket,
  ChevronRight,
  UserCheck,
  FileSearch,
  Lock as LockIcon,
  ExternalLink,
  AlertTriangle,
  CreditCard,
} from "lucide-react";

export default function LandingPage() {
  const contactEmail = "support@direct-cheers.com";
  const contactSubject = encodeURIComponent("【Direct Cheers】お問い合わせ");
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
          
          <div className="hidden md:flex gap-8 text-[11px] font-bold tracking-widest uppercase items-center">
            <Link href="/about" className="text-pink-500 hover:text-white transition-colors border border-pink-500/30 px-3 py-1 rounded-md bg-pink-500/5">About Us</Link>
            <Link href="#concept" className="text-slate-400 hover:text-pink-500 transition-colors">コンセプト</Link>
            <Link href="#demo" className="text-slate-400 hover:text-pink-500 transition-colors italic">DEMO</Link>
            <Link href="#plans" className="text-slate-400 hover:text-pink-500 transition-colors">プラン</Link>
            <Link href="#safety" className="text-slate-400 hover:text-indigo-400 transition-colors">Safety</Link>
            <Link href="/law" className="text-slate-500 hover:text-white underline decoration-pink-500/50 transition-colors">特定商取引法</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/auth/login"
              className="bg-white text-slate-950 px-5 py-2 rounded-full text-xs font-black hover:bg-pink-500 hover:text-white transition-all shadow-xl shadow-white/5 uppercase tracking-tighter flex items-center gap-2"
            >
              JOIN NOW
            </Link>
          </div>
        </div>
      </nav>

      {/* --- Hero Section --- */}
      <section id="concept" className="relative py-28 px-6 overflow-hidden border-b border-slate-900">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-pink-500/5 blur-[120px] rounded-full -z-10" />
        
        <div className="max-w-5xl mx-auto text-center">
          <span className="inline-block px-4 py-1.5 rounded-full border border-slate-800 text-slate-400 text-[10px] font-bold tracking-[0.2em] uppercase mb-8 bg-slate-900/50">
            Next-Gen Live Experience Platform
          </span>
          <h2 className="text-5xl md:text-8xl font-black mb-10 tracking-tighter text-white leading-[1.05] uppercase">
            ライブの感動を、<br />
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent italic">
              「スマホのウォレット」
            </span>
            へ。
          </h2>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-12 font-medium text-pretty">
            Direct Cheersは、会場のQRコードから応援を贈るプラットフォーム。<br className="hidden md:block" />
            応援の証（Cheers!）として、シリアル刻印入りのデジタル証明書を即座に発行。<br className="hidden md:block" />
            あなたのスマホの標準ウォレットアプリに格納できます。
          </p>
          <div className="flex justify-center gap-6">
            <Link href="#demo" className="bg-slate-100 text-slate-900 px-10 py-4 rounded-full font-bold hover:bg-pink-500 hover:text-white transition-all shadow-2xl scale-110">
              体験を詳しく知る
            </Link>
          </div>
        </div>
      </section>

      {/* --- Demo Section --- */}
      <section id="demo" className="py-24 px-6 relative border-b border-slate-900">
        <div className="max-w-6xl mx-auto">
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-8 md:p-16 rounded-[3rem] relative overflow-hidden flex flex-col md:flex-row items-center gap-12 group">
            <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-pink-500/10 blur-[100px] rounded-full" />
            
            <div className="flex-1 relative z-10 text-left text-pretty">
              <span className="text-pink-500 font-black italic tracking-[0.3em] text-[10px] uppercase block mb-4">Live Simulation</span>
              <h3 className="text-4xl md:text-5xl font-black text-white mb-6 italic tracking-tighter uppercase leading-tight">
                決済から発行まで、<br />
                一連の流れを体験。
              </h3>
              <p className="text-slate-400 leading-relaxed mb-8 max-w-md font-medium">
                本番同様のフローを体験できるシミュレーターを用意しました。<br />
                テスト決済の完了後、即座にブラウザ上で「応援証明書」が発行されるスムーズなUXを体感してください。
              </p>
              <Link href="/demo" className="inline-flex items-center gap-3 bg-gradient-to-r from-pink-500 to-violet-600 text-white px-8 py-4 rounded-full font-bold hover:scale-105 transition-all shadow-xl shadow-pink-500/20 uppercase tracking-widest">
                DEMOを今すぐ体験
              </Link>
            </div>

            <div className="flex-1 relative z-10 w-full md:w-auto">
              <div className="grid grid-cols-1 gap-4 p-8 bg-slate-950/50 rounded-[2rem] border border-slate-800 shadow-inner">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-700/50">
                  <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-500"><Smartphone size={20} /></div>
                  <div className="text-xs font-bold text-slate-300">QRコード読み取り・決済選択</div>
                  <CheckCircle2 size={16} className="ml-auto text-green-500" />
                </div>
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-700/50">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-500"><ShieldCheck size={20} /></div>
                  <div className="text-xs font-bold text-slate-300">Apple / Google Pay等 決済実行</div>
                  <CheckCircle2 size={16} className="ml-auto text-green-500" />
                </div>
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-700/50">
                  <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-500"><Zap size={20} /></div>
                  <div className="text-xs font-bold text-slate-300">応援証明書の発行</div>
                  <CheckCircle2 size={16} className="ml-auto text-green-500" />
                </div>
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/40 border border-amber-500/10 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.05] bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#f59e0b_10px,#f59e0b_20px)] pointer-events-none" />
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 relative">
                    <Wallet size={20} />
                    <Construction size={10} className="absolute -bottom-1 -right-1" />
                  </div>
                  <div className="flex flex-col text-left">
                    <div className="text-[11px] font-bold text-slate-600 uppercase italic leading-none mb-1">Wallet Integration</div>
                    <div className="text-[9px] text-slate-700 font-bold uppercase tracking-widest">Under Construction</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Features --- */}
      <section id="features" className="py-24 bg-slate-950 px-6 border-b border-slate-900">
        <div className="max-w-6xl mx-auto text-center">
          <div className="mb-20 text-pretty">
            <h3 className="text-4xl font-black text-white mb-4 italic tracking-tighter uppercase">The Digital Experience</h3>
            <p className="text-slate-500">透明な決済と、消えない感動を両立するテクノロジー</p>
          </div>
          <div className="grid md:grid-cols-3 gap-10 text-pretty">
            <Link href="/concept/realtime" className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800 hover:border-pink-500/50 transition-all group text-left hover:bg-slate-900/40 relative overflow-hidden block">
              <div className="text-pink-500 font-black text-5xl italic mb-6 opacity-50 group-hover:opacity-100 transition-opacity"><Zap size={40} /></div>
              <h4 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter">Real-time連動</h4>
              <p className="text-sm text-slate-400 leading-relaxed font-medium">応援をトリガーに会場のVJや照明が変化。あなたの熱量が現場の景色を塗り替える体験を提供します。</p>
              <div className="mt-6 flex items-center gap-2 text-pink-500 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                Learn More <ArrowRight size={12} />
              </div>
            </Link>

            <Link href="/concept/wallet" className="p-10 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-violet-500/20 shadow-2xl relative overflow-hidden group text-left hover:border-violet-500/50 transition-all block">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-violet-500/10 blur-3xl group-hover:bg-violet-500/20 transition-all" />
              <div className="text-violet-500 font-black text-5xl italic mb-6 group-hover:scale-110 transition-transform origin-left"><Wallet size={40} /></div>
              <h4 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter">Wallet保存</h4>
              <p className="text-sm text-slate-400 leading-relaxed font-medium">発行されたデジタルカードは Apple Wallet / Google Wallet に追加可能。記念証を、アプリ不要でいつでもスマホから呼び出せます。</p>
              <div className="mt-6 flex items-center gap-2 text-violet-500 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                Learn More <ArrowRight size={12} />
              </div>
            </Link>

            <Link href="/concept/proof" className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800 hover:border-indigo-500/50 transition-all text-left hover:bg-slate-900/40 group relative overflow-hidden text-pretty block">
              <div className="text-indigo-500 font-black text-5xl italic mb-6 opacity-50 group-hover:opacity-100 transition-opacity"><ShieldCheck size={40} /></div>
              <h4 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter">デジタル証跡</h4>
              <p className="text-sm text-slate-400 leading-relaxed font-medium">すべての資産には独自のシリアルナンバーを付与。改ざん不能な証跡管理により、正当な支援の記録をプラットフォームが保証します。</p>
              <div className="mt-6 flex items-center gap-2 text-indigo-500 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                Learn More <ArrowRight size={12} />
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* --- Service Plans --- */}
      <section id="plans" className="py-24 px-6 bg-slate-950 border-b border-slate-900 relative">
        <div className="absolute inset-0 opacity-[0.01] bg-[repeating-linear-gradient(90deg,transparent,transparent_50px,#fff_50px,#fff_51px)] pointer-events-none" />
        <div className="max-w-6xl mx-auto relative z-10 text-center">
          <div className="mb-20 text-pretty">
            <span className="text-pink-500 font-black italic tracking-[0.3em] text-[10px] uppercase block mb-4">Service Lineup</span>
            <h3 className="text-4xl md:text-5xl font-black text-white mb-4 italic tracking-tighter uppercase leading-tight">提供サービスと価格体系</h3>
            <p className="text-slate-500 max-w-2xl mx-auto font-medium">
              すべての決済は、デジタル資産の譲渡、演出参加、またはイベント入場権利の付与という「明確な役務」に基づいています。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Link href="/concept/standard" className="p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-pink-500/50 transition-all relative overflow-hidden text-left hover:bg-slate-900/60">
              <div className="absolute top-0 right-0 px-5 py-1.5 bg-green-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Auto Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-pink-500 border border-slate-700 group-hover:bg-pink-500/10 transition-colors"><Award size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Standard</h4>
              </div>
              <div className="mb-8">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter">¥1,000</p>
                <p className="text-slate-600 text-[10px] font-mono mt-1">上限: ¥3,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium">
                <li className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-pink-500" /> デジタルカード即時発行</li>
                <li className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-pink-500" /> シリアル刻印・Wallet格納</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-pink-400 transition-colors">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span>
                <ChevronRight size={16} />
              </div>
            </Link>

            <Link href="/concept/message" className="p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-violet-500/50 transition-all relative overflow-hidden text-left hover:bg-slate-900/60">
              <div className="absolute top-0 right-0 px-5 py-1.5 bg-green-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Auto Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-violet-500 border border-slate-700 group-hover:bg-violet-500/10 transition-colors"><BellDot size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Message</h4>
              </div>
              <div className="mb-8">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter">¥2,000</p>
                <p className="text-slate-600 text-[10px] font-mono mt-1">上限: ¥5,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium">
                <li className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-violet-500" /> 公式ログへの永続保存</li>
                <li className="flex items-center gap-2.5"><CheckCircle2 size={16} className="text-violet-500" /> アーティスト閲覧権の付与</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-violet-400 transition-colors">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span>
                <ChevronRight size={16} />
              </div>
            </Link>

            <Link href="/concept/entrance" className="p-8 rounded-[2.5rem] bg-slate-950 border-2 border-indigo-500/30 shadow-[0_0_40px_rgba(79,70,229,0.15)] flex flex-col group relative overflow-hidden text-left text-pretty hover:bg-indigo-500/5 transition-all">
              <div className="absolute top-0 right-0 px-5 py-1.5 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Review Required</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-colors"><Ticket size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Entrance</h4>
              </div>
              <div className="mb-8">
                <p className="text-indigo-300 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter">¥5,000</p>
                <p className="text-slate-600 text-[10px] font-mono mt-1">上限: ¥30,000</p>
              </div>
              <ul className="text-sm text-slate-300 space-y-3.5 mb-10 flex-1 font-semibold">
               <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-indigo-400 shrink-0" /> デジタル入場権利の発行</li>
                <li className="flex items-center gap-2.5 font-bold"><CheckCircle2 size={16} className="text-indigo-400 shrink-0" /> エージェントによる価格適正審査</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-indigo-400 transition-colors">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span>
                <ChevronRight size={16} />
              </div>
            </Link>

            <Link href="/concept/custom" className="p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 flex flex-col group hover:border-amber-500/50 transition-all relative overflow-hidden text-left hover:bg-slate-900/60">
              <div className="absolute top-0 right-0 px-5 py-1.5 bg-amber-600 text-white text-[9px] font-black uppercase tracking-[0.2em] italic shadow-lg">Manual Process</div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-amber-500 border border-slate-700 group-hover:bg-amber-500/10 transition-colors"><Construction size={24} /></div>
                <h4 className="text-2xl font-bold text-white italic uppercase tracking-tighter">Custom</h4>
              </div>
              <div className="mb-8">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">想定ボリューム</p>
                <p className="text-4xl font-black text-white italic tracking-tighter">¥10,000</p>
                <p className="text-slate-600 text-[10px] font-mono mt-1">上限: ¥100,000</p>
              </div>
              <ul className="text-sm text-slate-400 space-y-3.5 mb-10 flex-1 font-medium">
                <li className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-amber-500" /> 内容に応じた個別役務</li>
                <li className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-amber-500" /> 完了エビデンスの事前定義</li>
              </ul>
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between group-hover:text-amber-400 transition-colors">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">詳細を確認する</span>
                <ChevronRight size={16} />
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* --- Safety & Trust Section --- */}
      <section id="safety" className="py-24 px-6 relative bg-slate-950 overflow-hidden border-b border-slate-900">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/5 blur-[120px] rounded-full -z-10" />
        
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-indigo-400 font-black italic tracking-[0.3em] text-[10px] uppercase block mb-4">
              Trust & Governance
            </span>
            <h3 className="text-4xl md:text-5xl font-black text-white mb-6 italic tracking-tighter uppercase">
              安心・安全への<span className="text-indigo-500 underline decoration-indigo-500/30">徹底した誓約</span>
            </h3>
            <p className="text-slate-400 max-w-2xl mx-auto font-medium leading-relaxed">
              25年の金融システム開発の知見を活かし、日本の法令を遵守。<br className="hidden md:block" />
              アーティストとファンの信頼を守るための厳格なガバナンス体制を構築しています。
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 hover:border-indigo-500/30 transition-all group">
              <UserCheck className="text-indigo-500 mb-6 group-hover:scale-110 transition-transform" size={32} />
              <h4 className="text-lg font-bold text-white mb-3 italic uppercase tracking-tighter">加盟店審査</h4>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">全オーガナイザーへのKYC（本人確認）を実施。プラットフォームによる事前承認を必須としています。</p>
            </div>
            <div className="p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 hover:border-indigo-500/30 transition-all group">
              <FileSearch className="text-indigo-500 mb-6 group-hover:scale-110 transition-transform" size={32} />
              <h4 className="text-lg font-bold text-white mb-3 italic uppercase tracking-tighter">対価の正当性</h4>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">アイテムの価値と決済額が妥当かを個別に審査。不適切な取引はシステムで自動遮断されます。</p>
            </div>
            <div className="p-8 rounded-[2.5rem] bg-slate-900/40 border border-slate-800 hover:border-indigo-500/30 transition-all group">
              <LockIcon className="text-indigo-500 mb-6 group-hover:scale-110 transition-transform" size={32} />
              <h4 className="text-lg font-bold text-white mb-3 italic uppercase tracking-tighter">資金移動の透明性</h4>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">イベント開催のエビデンス照合まで売上をロック。1円単位のログ照合で不正を許しません。</p>
            </div>
          </div>

          <div className="text-center">
            <Link 
              href="/safety" 
              className="inline-flex items-center gap-3 bg-indigo-600/10 text-indigo-400 border border-indigo-500/30 px-8 py-4 rounded-full font-black text-xs hover:bg-indigo-600 hover:text-white transition-all uppercase tracking-widest group"
            >
              安全性に関する詳細ポリシーを見る 
              <ShieldCheck size={14} className="group-hover:rotate-12 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* --- Stripe Link 事前準備セクション --- */}
      <section id="payment-prep" className="py-24 px-6 bg-slate-950 relative overflow-hidden border-b border-slate-900">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-orange-500/5 blur-[120px] rounded-full -z-10" />
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950/20 border border-orange-500/20 rounded-[3rem] p-8 md:p-14 shadow-[0_0_60px_rgba(249,115,22,0.06)] space-y-10">

            {/* ヘッダー */}
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 text-orange-400 font-black italic tracking-[0.3em] text-[10px] uppercase">
                <Zap size={12} />
                Payment Prep
              </span>
              <h3 className="text-3xl md:text-4xl font-black text-white italic tracking-tighter uppercase leading-tight">
                イベント現場で<br />
                <span className="text-orange-400">「1秒決済」</span>するための<br />
                事前準備
              </h3>
            </div>

            {/* Apple/Google Pay説明 */}
            <div className="flex items-start gap-4 p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20 shrink-0 mt-0.5">
                <Smartphone size={18} className="text-emerald-400" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-black text-emerald-400">Apple Pay / Google Pay なら今すぐ使えます</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  端末にApple PayやGoogle Payが設定されていれば、現場でQRを読み取るだけでそのまま1秒でチアできます。サインインも事前登録も不要です。
                </p>
              </div>
            </div>

            {/* PayPay警告 + Stripe Link案内 */}
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-5 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20 shrink-0 mt-0.5">
                  <AlertTriangle size={18} className="text-amber-400" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-black text-amber-400">⚠️ 重要なご注意</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    イベントのプランによっては、<span className="text-amber-300 font-bold">PayPayがご利用いただけない会場</span>がございます。
                    Apple / Google Pay をお持ちでない方や、普段PayPayをご利用の方は、当日現場で慌てないために、いまのうちに対策しておくことを強くお勧めします。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-5 bg-slate-800/60 border border-slate-700 rounded-2xl">
                <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20 shrink-0 mt-0.5">
                  <CreditCard size={18} className="text-indigo-400" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-black text-white">Stripe Linkへのカード登録（所要1分）が解決策です</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Stripe Linkにクレジットカードを事前登録しておくと、どの会場でも<span className="text-white font-bold">メールアドレス入力だけの1秒決済</span>が可能になります。
                    登録は外部サービス（Stripe）での手続きで、当プラットフォームへのサインアップは不要です。
                  </p>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      <CheckCircle2 size={11} className="text-emerald-500" /> あらゆる会場で使える
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      <CheckCircle2 size={11} className="text-emerald-500" /> カード情報の再入力不要
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      <CheckCircle2 size={11} className="text-emerald-500" /> PayPay不可の会場でも安心
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* CTAボタン */}
            <a
              href="/link-setup"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white rounded-2xl py-5 font-black text-sm uppercase tracking-wider transition-all hover:scale-[1.02] shadow-xl shadow-orange-500/20 active:scale-[0.98]"
            >
              <CreditCard size={18} />
              Stripe Linkにカードを事前登録（外部サイトへ）
              <ExternalLink size={14} className="opacity-70" />
            </a>
          </div>
        </div>
      </section>

      {/* --- Platform Identity --- */}
      <section className="py-32 px-6 bg-slate-950 relative overflow-hidden">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center bg-slate-900/40 border border-slate-800 rounded-[3.5rem] p-8 md:p-16 relative group hover:border-slate-700 transition-colors">
            <div className="space-y-8 text-left text-pretty">
              <span className="text-indigo-400 font-black italic tracking-[0.4em] text-[10px] uppercase block">Platform Identity</span>
              <h3 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter uppercase leading-[1.1]">金融の堅牢さと、<br />現場の熱狂を<br /><span className="text-pink-500">ひとつに。</span></h3>
              <p className="text-slate-400 leading-relaxed font-medium">Direct Cheersは、25年の金融システム開発キャリアを持つエンジニアが設計しました。一時の流行ではなく、決済インフラとしての安定性と、音楽現場を知る者としての熱量を両立させています。</p>
              <Link href="/about" className="inline-flex items-center gap-4 bg-white text-slate-950 px-10 py-4 rounded-full font-black text-sm hover:bg-indigo-500 hover:text-white transition-all shadow-2xl group uppercase tracking-widest">運営者について詳しく見る <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" /></Link>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 rounded-3xl bg-slate-950 border border-slate-800 space-y-4 text-left text-pretty">
                <Database className="text-indigo-400" size={24} />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Payment Logic</p>
                <p className="text-white font-bold text-sm tracking-tighter leading-tight italic">25yrs Finance System Arch</p>
              </div>
              <div className="p-6 rounded-3xl bg-slate-950 border border-slate-800 space-y-4 text-left text-pretty">
                <Music className="text-pink-500" size={24} />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Live Culture</p>
                <p className="text-white font-bold text-sm tracking-tighter leading-tight italic">20yrs Event Promotion</p>
              </div>
              <div className="p-6 rounded-3xl bg-slate-950 border border-slate-800 space-y-4 text-left text-pretty">
                <ShieldCheck className="text-violet-400" size={24} />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Compliance</p>
                <p className="text-white font-bold text-sm tracking-tighter leading-tight italic">High Grade Security</p>
              </div>
              <div className="p-6 rounded-3xl bg-slate-950 border border-slate-800 space-y-4 text-left text-pretty">
                <Award className="text-amber-400" size={24} />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Proof of Value</p>
                <p className="text-white font-bold text-sm tracking-tighter leading-tight italic">Digital Asset Delivery</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Footer --- */}
      <footer className="py-24 px-6 border-t border-slate-800 bg-slate-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-16 text-pretty">
          <div className="space-y-6 text-left">
            <h5 className="font-bold text-white tracking-tighter italic text-xl uppercase">Direct Cheers</h5>
            <p className="text-slate-500 text-[10px] uppercase tracking-[0.3em]">Digital Assets for Live Moments.</p>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-16 text-left">
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Navigation</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-bold tracking-widest uppercase">
                <li><Link href="/about" className="text-pink-500 hover:text-white transition-all">私たちについて</Link></li>
                <li><Link href="#concept" className="hover:text-pink-500 transition-colors">Concept</Link></li>
                <li><Link href="/demo" className="hover:text-pink-500 transition-colors italic">Demo Experience</Link></li>
              </ul>
            </div>
            
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Legal</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-medium tracking-widest uppercase">
                <li><Link href="/terms" className="hover:text-white transition-colors">利用規約</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">プライバシーポリシー</Link></li>
                <li><Link href="/law" className="hover:text-white transition-colors">特定商取引法</Link></li>
                <li><Link href="/safety" className="text-indigo-400 hover:text-white transition-colors font-bold border-b border-indigo-500/30 pb-0.5">安心・安全への取り組み</Link></li>
              </ul>
            </div>

            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Contact</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-medium tracking-widest uppercase">
                <li><a href={mailUrl} className="hover:text-white transition-colors">お問い合わせ</a></li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto mt-24 pt-8 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-600 text-[10px] font-mono italic">© 2026 Direct Cheers Platform.</p>
          <div className="flex gap-6">
             <span className="text-[10px] text-slate-700 font-bold tracking-tighter italic uppercase">Innovation in Live Entertainment</span>
          </div>
        </div>
      </footer>
    </div>
  );
}