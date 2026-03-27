'use client';

import React from 'react';
import Link from 'next/link';
import { Play, Wallet, ShieldCheck, Zap, ArrowRight, Award, Database, Music, Mail, Smartphone, CheckCircle2 } from "lucide-react";

export default function LandingPage() {
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
            <Link href="#features" className="text-slate-400 hover:text-pink-500 transition-colors">機能・体験</Link>
            <Link href="/law" className="text-slate-500 hover:text-white underline decoration-pink-500/50 transition-colors">特定商取引法</Link>
          </div>

          <div className="flex items-center gap-4">
            <a 
              href="mailto:support@direct-cheers.com?subject=【Direct Cheers】参加・導入に関するお問い合わせ"
              className="bg-white text-slate-950 px-5 py-2 rounded-full text-xs font-black hover:bg-pink-500 hover:text-white transition-all shadow-xl shadow-white/5 uppercase tracking-tighter flex items-center gap-2 group"
            >
              <Mail size={14} className="group-hover:animate-pulse" />
              JOIN NOW
            </a>
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
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-12 font-medium">
            Direct Cheersは、会場のQRコードから応援を贈るプラットフォーム。<br className="hidden md:block" />
            応援の証（Cheers!）は、シリアル刻印入りのデジタル証明書を即座に発行。<br className="hidden md:block" />
            あなたのスマホの標準ウォレットアプリに格納できます。
          </p>
          <div className="flex justify-center gap-6">
            <Link href="#demo" className="bg-slate-100 text-slate-900 px-10 py-4 rounded-full font-bold hover:bg-pink-500 hover:text-white transition-all shadow-2xl scale-110">
              体験を詳しく知る
            </Link>
          </div>
        </div>
      </section>

      {/* --- Demo Section (Video Removed) --- */}
      <section id="demo" className="py-24 px-6 relative border-b border-slate-900">
        <div className="max-w-6xl mx-auto">
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-8 md:p-16 rounded-[3rem] relative overflow-hidden flex flex-col md:flex-row items-center gap-12 group">
            <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-pink-500/10 blur-[100px] rounded-full" />
            
            <div className="flex-1 relative z-10 text-left">
              <span className="text-pink-500 font-black italic tracking-[0.3em] text-[10px] uppercase block mb-4">Live Simulation</span>
              <h3 className="text-4xl md:text-5xl font-black text-white mb-6 italic tracking-tighter uppercase leading-tight">
                決済から保存まで、<br />
                一連の流れを体験。
              </h3>
              <p className="text-slate-400 leading-relaxed mb-8 max-w-md font-medium">
                本番同様のフローを体験できるシミュレーターを用意しました。<br />
                テスト決済の完了後、実際にあなたのスマホに「応援証明書」が届くスムーズなUXを体感してください。
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
                  <div className="text-xs font-bold text-slate-300">Apple / Google Pay 決済実行</div>
                  <CheckCircle2 size={16} className="ml-auto text-green-500" />
                </div>
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-900/80 border border-pink-500/30 shadow-[0_0_15px_rgba(236,72,153,0.1)]">
                  <div className="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center text-white"><Wallet size={20} /></div>
                  <div className="text-xs font-bold text-white uppercase italic">Walletにデジタル証跡を保存</div>
                  <Zap size={16} className="ml-auto text-yellow-400 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Features Section --- */}
      <section id="features" className="py-24 bg-slate-950 px-6 border-b border-slate-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h3 className="text-4xl font-black text-white mb-4 italic tracking-tighter uppercase">The Digital Experience</h3>
            <p className="text-slate-500">透明な決済と、消えない感動を両立するテクノロジー</p>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            <Link href="/concept/realtime" className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800 hover:border-pink-500/50 transition-all group block text-left hover:bg-slate-900/40 relative overflow-hidden">
              <div className="text-pink-500 font-black text-5xl italic mb-6 opacity-50 group-hover:opacity-100 transition-opacity">
                <Zap size={40} />
              </div>
              <h4 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter">Real-time連動</h4>
              <p className="text-sm text-slate-400 leading-relaxed font-medium">
                応援をトリガーに会場のVJや照明が変化。あなたの熱量が現場の景色を塗り替える、双方向のライブ体験を提供します。
              </p>
            </Link>

            <Link href="/concept/wallet" className="p-10 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-violet-500/20 shadow-2xl relative overflow-hidden group block text-left hover:border-violet-500/50 transition-all">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-violet-500/10 blur-3xl group-hover:bg-violet-500/20 transition-all" />
              <div className="text-violet-500 font-black text-5xl italic mb-6 group-hover:scale-110 transition-transform origin-left">
                <Wallet size={40} />
              </div>
              <h4 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter">Wallet保存</h4>
              <p className="text-sm text-slate-400 leading-relaxed font-medium">
                発行されたデジタルカードは Apple Wallet / Google Wallet に追加可能。
                記念証を、アプリ不要でいつでもスマホから呼び出せます。
              </p>
            </Link>

            <Link href="/concept/proof" className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800 hover:border-indigo-500/50 transition-all block text-left hover:bg-slate-900/40 group relative overflow-hidden">
              <div className="text-indigo-500 font-black text-5xl italic mb-6 opacity-50 group-hover:opacity-100 transition-opacity">
                <ShieldCheck size={40} />
              </div>
              <h4 className="text-2xl font-bold text-white mb-4 italic uppercase tracking-tighter">デジタル証跡</h4>
              <p className="text-sm text-slate-400 leading-relaxed font-medium">
                すべての資産には独自のシリアルナンバーを付与。
                改ざん不能な証跡管理システムにより、正当な支援の記録をプラットフォームが保証します。
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* --- Strategic About Us Entry --- */}
      <section className="py-32 px-6 bg-slate-950 relative overflow-hidden text-pretty">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-indigo-500/5 blur-[120px] rounded-full -z-10" />
        
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center bg-slate-900/40 border border-slate-800 rounded-[3.5rem] p-8 md:p-16 relative group hover:border-slate-700 transition-colors">
            <div className="space-y-8">
              <span className="text-indigo-400 font-black italic tracking-[0.4em] text-[10px] uppercase block">Platform Identity</span>
              <h3 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter uppercase leading-[1.1]">
                金融の堅牢さと、<br />
                現場の熱狂を<br />
                <span className="text-pink-500">ひとつに。</span>
              </h3>
              <p className="text-slate-400 leading-relaxed font-medium">
                Direct Cheersは、25年の金融システム開発キャリアを持つエンジニアが設計しました。
                一時の流行ではなく、決済インフラとしての安定性と、音楽現場を知る者としての熱量を両立させています。
              </p>
              <Link href="/about" className="inline-flex items-center gap-4 bg-white text-slate-950 px-10 py-4 rounded-full font-black text-sm hover:bg-indigo-500 hover:text-white transition-all shadow-2xl group uppercase tracking-widest">
                運営者について詳しく見る
                <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 rounded-3xl bg-slate-950 border border-slate-800 space-y-4">
                <Database className="text-indigo-400" size={24} />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Payment Logic</p>
                <p className="text-white font-bold text-sm tracking-tighter leading-tight italic">25yrs Finance System Arch</p>
              </div>
              <div className="p-6 rounded-3xl bg-slate-950 border border-slate-800 space-y-4">
                <Music className="text-pink-500" size={24} />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Live Culture</p>
                <p className="text-white font-bold text-sm tracking-tighter leading-tight italic">20yrs Event Promotion</p>
              </div>
              <div className="p-6 rounded-3xl bg-slate-950 border border-slate-800 space-y-4">
                <Award className="text-yellow-500" size={24} />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Certification</p>
                <p className="text-white font-bold text-sm tracking-tighter leading-tight italic">PMP Project Management</p>
              </div>
              <div className="p-6 rounded-3xl bg-slate-950 border border-slate-800 space-y-4">
                <Zap className="text-green-400" size={24} />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Web Tech</p>
                <p className="text-white font-bold text-sm tracking-tighter leading-tight italic">Latest Edge Functions</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Contact Section --- */}
      <section id="contact" className="py-32 px-6 bg-slate-950 relative overflow-hidden text-center border-t border-slate-900">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-pink-500/5 blur-[120px] rounded-full -z-10" />

        <div className="max-w-4xl mx-auto space-y-12 text-pretty">
          <div className="space-y-4">
            <span className="text-pink-500 font-black italic tracking-[0.4em] text-[10px] uppercase block">Contact Us</span>
            <h3 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter uppercase leading-tight">
              お問い合わせ
            </h3>
            <p className="text-slate-400 font-medium leading-relaxed max-w-xl mx-auto">
              サービス導入をご希望のオーガナイザー・アーティスト様、<br className="md:block hidden" />
              および、システムに関するご質問は、下記よりお気軽にご連絡ください。
            </p>
          </div>

          <div className="flex flex-col items-center gap-6">
            <a 
              href="mailto:support@direct-cheers.com?subject=【Direct Cheers】お問い合わせ" 
              className="group relative flex items-center justify-center gap-4 bg-white text-slate-950 px-8 md:px-16 py-6 rounded-[2rem] font-black text-lg hover:bg-pink-500 hover:text-white transition-all shadow-2xl shadow-white/5 tracking-tighter w-full md:w-auto"
            >
              <Mail size={22} className="group-hover:animate-bounce" />
              <span>SUPPORT@DIRECT-CHEERS.COM</span>
            </a>
            
            <p className="text-slate-600 text-[10px] font-bold uppercase tracking-[0.2em]">
              通常 2営業日以内に担当よりご返信いたします
            </p>
          </div>
        </div>
      </section>

      {/* --- Footer Area --- */}
      <footer className="py-24 px-6 border-t border-slate-800 bg-slate-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-16">
          <div className="space-y-6">
            <h5 className="font-bold text-white tracking-tighter italic text-xl">DIRECT CHEERS</h5>
            <p className="text-slate-500 text-[10px] max-w-xs leading-relaxed uppercase tracking-[0.3em]">
              Digital Assets for Live Moments.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-16 sm:gap-24 text-left">
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Navigation</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-bold tracking-widest uppercase">
                <li><Link href="/about" className="text-pink-500 hover:text-white transition-all">私たちについて</Link></li>
                <li><Link href="#concept" className="hover:text-pink-500 transition-colors">Concept</Link></li>
                <li><Link href="/demo" className="hover:text-pink-500 transition-colors italic">Demo Experience</Link></li>
                <li><Link href="#features" className="hover:text-pink-500 transition-colors">Features</Link></li>
              </ul>
            </div>
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Legal</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-medium tracking-widest uppercase">
                <li><Link href="/terms" className="hover:text-white transition-colors">利用規約</Link></li>
                <li><Link href="/law" className="hover:text-white transition-colors">特定商取引法</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">プライバシーポリシー</Link></li>
              </ul>
            </div>
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Support</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-medium tracking-widest uppercase">
                <li><a href="mailto:support@direct-cheers.com" className="hover:text-white transition-colors">お問い合わせ</a></li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto mt-24 pt-8 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-600 text-[10px] font-mono italic">© 2026 Direct Cheers Platform.</p>
        </div>
      </footer>
    </div>
  );
}