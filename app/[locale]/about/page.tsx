'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, Target, Mail, Zap, Award, ShieldCheck, Database, Lock, Search, FileText, ExternalLink, History, Calendar, CheckCircle2 } from "lucide-react";

export default function AboutPage() {
  const contactEmail = "support@direct-cheers.com";
  const contactSubject = encodeURIComponent("【Direct Cheers】お問い合わせ");
  const mailUrl = `mailto:${contactEmail}?subject=${contactSubject}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      {/* --- Background Effect --- */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-500/10 blur-[120px] rounded-full opacity-60" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full opacity-60" />
      </div>

      {/* --- Navigation --- */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <img 
              src="/logo-emblem.png" 
              alt="Direct Cheers Logo" 
              className="w-9 h-9 rounded-lg shadow-lg shadow-pink-500/10 group-hover:scale-110 transition-transform"
            />
            <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic text-[1.2rem] md:text-2xl">Direct Cheers</h1>
          </Link>
          <div className="hidden md:flex items-center gap-4 text-xs font-bold text-slate-500 tracking-widest uppercase bg-slate-900 px-5 py-2.5 rounded-full border border-slate-800 shadow-inner">
            <Zap className="text-pink-500" size={16} fill="currentColor" />
            Platform Info
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-20 px-6 relative z-10">
        <div className="mb-16">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-pink-500 transition-colors uppercase tracking-widest group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> BACK TO TOP
          </Link>
        </div>

        {/* --- Hero Section --- */}
        <section className="text-center mb-32 relative py-16">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-br from-pink-500/15 via-indigo-500/10 to-transparent blur-[100px] rounded-full -z-10" />
          <span className="text-pink-500 font-black italic tracking-[0.4em] text-[10px] uppercase mb-6 block">ABOUT THE PLATFORM</span>
          
          <h2 className="text-4xl md:text-7xl font-black mb-10 tracking-tighter text-white leading-[1.1] uppercase italic text-pretty">
            一晩の熱狂を、<br />
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
             「続く関係」の起点に。
            </span>
          </h2>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed font-medium text-pretty px-4">
            Direct Cheersは、単なる決済ツールではありません。<br className="hidden md:block" />
            ライブ会場で生まれた一瞬の熱量を、シリアル刻印入りの「不変の支援実績」として記録。<br className="hidden md:block" />
            イベントが終わった後も、オーガナイザーやアーティストがファンとダイレクトに繋がり、<br className="hidden md:block" />
            次の物語を共に創り出すためのプラットフォームです。
          </p>
        </section>

        {/* --- Founder's Message --- */}
        <section className="p-8 md:p-16 rounded-[2.5rem] bg-slate-900 border border-slate-800 shadow-2xl mb-32 relative overflow-hidden flex flex-col md:flex-row gap-12 items-center text-pretty">
          <div className="w-48 h-48 md:w-64 md:h-64 rounded-full border-4 border-slate-700 shadow-2xl overflow-hidden flex-shrink-0 relative group bg-slate-950">
            <img 
              src="/moriwaki-portrait.png" 
              alt="Founder: Hirotaka Moriwaki" 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 shadow-inner" 
            />
          </div>
          
          <div className="flex-1">
            <span className="text-indigo-400 font-black italic tracking-[0.4em] text-[10px] uppercase mb-4 block">Founder's Message</span>
            
            <div className="flex items-center gap-4 mb-2">
              <h3 className="text-2xl md:text-4xl font-black text-white italic tracking-tighter uppercase">森脇 弘貴 / Hirotaka Moriwaki</h3>
              <a 
                href="https://www.facebook.com/spacemind.hiro?locale=ja_JP" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="p-2.5 bg-blue-600/10 hover:bg-blue-600/30 rounded-full transition-all text-blue-400 border border-blue-500/20 shadow-inner group"
                title="Facebook: Spacemind Hiro"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
              </a>
            </div>

            <p className="text-slate-500 font-medium uppercase tracking-[0.2em] text-sm mb-6">Direct Cheers Founder & CEO</p>
            
            <div className="flex flex-wrap gap-3 mb-8">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950 border border-indigo-500/40 text-indigo-300 text-[10px] font-bold uppercase tracking-tighter shadow-lg shadow-indigo-500/5">
                <Award size={14} /> 応用情報処理技術者
              </span>
              
              <a 
                href="/PMI Certification.pdf" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950 border border-pink-500/40 text-pink-300 text-[10px] font-bold uppercase tracking-tighter hover:bg-pink-500/10 transition-all cursor-pointer group shadow-lg shadow-pink-500/5"
                title="View PMP Certificate"
              >
                <Award size={14} className="group-hover:scale-110 transition-transform text-pink-500" /> 
                <span>PMP (Project Management Professional)</span>
                <span className="ml-2 text-[8px] opacity-60 border-l border-pink-500/30 pl-2">Since 2008</span>
                <FileText size={12} className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            </div>

            <div className="space-y-6 text-slate-300 font-medium leading-relaxed italic text-sm md:text-base">
              <p>25年以上にわたり、ミッションクリティカルなクレジットカード基幹システムの開発・保守に従事。決済データの「1円の重み」と、止まることが許されないトランザクションの厳格さを熟知しています。</p>
              
              <p>
                同時に、2003年から20年以上にわたり、ビーチパーティー
                <a 
                  href="https://www.facebook.com/profile.php?id=100064419200791" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mx-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-white hover:bg-pink-500/10 hover:border-pink-500/30 hover:text-pink-300 transition-all font-bold not-italic group"
                  title="SpaceMind (Activity Page)"
                >
                  <Zap size={14} className="text-pink-500 group-hover:scale-110 transition-transform" />
                  <span>SpaceMind</span>
                  <ExternalLink size={10} className="opacity-50" />
                </a>
                を主催。イベントの現場で生まれる純粋な熱狂を、デジタル技術によって可視化し、アーティストやオーガナイザーへよりダイレクトに還元できる仕組みを作りたいと願ってきました。
              </p>
              
              <p>金融グレードの堅牢さと、音楽現場の熱量。この二つを最新のウェブ技術で統合し、ファンとアーティストの新しい経済圏を構築します。</p>
            </div>
          </div>
        </section>

        {/* --- Launch Roadmap Section --- */}
        <section className="mb-32 relative">
          <div className="text-center mb-16">
            <span className="text-pink-500 font-black italic tracking-[0.4em] text-[10px] uppercase mb-4 block">Project Timeline</span>
            <h3 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-tight">
              ローンチへの軌跡
            </h3>
          </div>

          <div className="max-w-4xl mx-auto relative px-6">
            {/* Center Line */}
            <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-pink-500 via-indigo-500 to-transparent opacity-30" />

            {[
              { date: "2026.Q1", status: "Done", title: "Core Architecture", desc: "金融グレードの決済基盤およびEdge環境の構築が完了。堅牢なデータ整合性を確保。" },
              { date: "2026.04", status: "Active", title: "Closed Beta / Demo", desc: "特定のオーガナイザー様との限定テストおよび、本サイトでの公開デモシミュレーターをリリース。" },
              { date: "2026.05", status: "Next", title: "Stripe Connect Integration", desc: "Stripe Connectを用いた、アーティストへの迅速かつ透明性の高い分配システムの最終統合。" },
              { date: "2026.06", status: "Launch", title: "Official Service Launch", desc: "特定オーガナイザー様の音楽イベントを皮切りに正式稼働開始。ファンとアーティストを繋ぐ新たな応援文化をスタート。" }
            ].map((item, i) => (
              <div key={i} className={`relative flex items-center justify-between mb-12 md:mb-16 ${i % 2 === 0 ? 'md:flex-row-reverse' : ''}`}>
                <div className="hidden md:block w-5/12" />
                <div className="absolute left-6 md:left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-slate-950 border-2 border-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.5)] z-10" />
                
                <div className="w-full md:w-5/12 pl-12 md:pl-0">
                  <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-pink-500/30 transition-all group shadow-xl">
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded border mb-3 inline-block uppercase tracking-widest ${item.status === 'Active' ? 'bg-pink-500/20 border-pink-500 text-pink-500 animate-pulse' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                      {item.status}
                    </span>
                    <div className="text-white font-black italic text-xl tracking-tighter mb-1 uppercase">{item.date}</div>
                    <h4 className="text-indigo-400 font-bold text-sm mb-3 uppercase tracking-tighter">{item.title}</h4>
                    <p className="text-slate-400 text-xs leading-relaxed font-medium">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* --- Verification Flow Section --- */}
        <section className="mb-32 relative">
          <div className="text-center mb-16">
            <span className="text-indigo-400 font-black italic tracking-[0.4em] text-[10px] uppercase mb-4 block">Trust & Safety</span>
            <h3 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-tight">
              実在性と透明性の担保
            </h3>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "イベント実在性の確認",
                desc: "申請されたイベントの公式情報や主催者の活動実績をスタッフが1件ずつ目視で確認。実体のない架空イベントの登録を徹底排除します。",
                icon: <Search className="text-pink-500" size={24} />
              },
              {
                title: "権利と還元の保護",
                desc: "アーティストのパブリシティ権を尊重し、主催者との正当な関係性を確認。ファンからの応援が確実に届くルートのみを承認します。",
                icon: <ShieldCheck className="text-indigo-400" size={24} />
              },
              {
                title: "不審取引の常時監視",
                desc: "Stripeの高度な不正検知システムと連携。不自然な決済パターンを24時間体制でモニタリングし、健全な応援環境を維持します。",
                icon: <Lock className="text-yellow-400" size={24} />
              }
            ].map((item, i) => (
              <div key={i} className="p-10 rounded-[2rem] bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all group shadow-xl">
                <div className="mb-6 w-14 h-14 rounded-2xl bg-slate-950 flex items-center justify-center border border-slate-800 shadow-inner group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <h4 className="text-xl font-black text-white italic mb-4 uppercase tracking-tighter">{item.title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed font-medium">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* --- Tech Stack Section --- */}
        <section className="mb-32">
          <div className="text-center mb-16">
            <span className="text-pink-500 font-black italic tracking-[0.4em] text-[10px] uppercase mb-4 block">Technology Stack</span>
            <h3 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-tight">金融グレードの設計思想</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Edge Realtime",
                desc: "Next.jsと最新のクラウド技術を活用した高速処理超低遅延データ処理。ライブ会場での『今この瞬間』の応援を即座に反映します。",
                icon: <Zap className="text-yellow-400" />
              },
              {
                title: "Stripe Connect",
                desc: "世界標準の決済インフラを採用。PCI-DSS準拠のセキュアな取引と、アーティストへの迅速な送金を実現しています。",
                icon: <Database className="text-green-400" />
              },
              {
                title: "Data Integrity",
                desc: "金融システム開発の知見を活かし、不整合が許されないアトミックなトランザクション管理をデータベース層で徹底。実際の決済結果との照合を行い、正確な記録を保ちます。",
                icon: <History className="text-indigo-400" />
              }
            ].map((tech, i) => (
              <div key={i} className="p-8 rounded-3xl bg-slate-900/50 border border-slate-800 hover:border-pink-500/50 transition-colors group">
                <div className="mb-6 w-12 h-12 rounded-xl bg-slate-950 flex items-center justify-center border border-slate-800 group-hover:rotate-12 transition-transform">
                  {tech.icon}
                </div>
                <h4 className="text-xl font-black text-white italic mb-4 uppercase tracking-tighter">{tech.title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed font-medium">{tech.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* --- Settlement Flow Section (追加) --- */}
        <section className="mb-32 relative py-20 bg-slate-900/40 border-y border-slate-800/50 rounded-[3rem] px-8 md:px-16 overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] rounded-full" />
          <div className="max-w-4xl mx-auto text-left relative z-10">
            <div className="mb-16">
              <span className="text-pink-500 font-black italic tracking-[0.3em] text-[10px] uppercase block mb-4">Financial Governance</span>
              <h3 className="text-3xl md:text-4xl font-black text-white italic tracking-tighter uppercase leading-tight">
                清算・支払管理フローの厳格化
              </h3>
              <p className="mt-6 text-slate-400 font-medium leading-relaxed text-sm md:text-base">
                本サービスでは、決済の安全性を担保するため、以下のステップを経て初めて精算を実行します。
              </p>
            </div>

            <div className="space-y-12">
              <div className="flex gap-6 md:gap-10">
                <div className="flex-none w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-white text-xs font-black italic shadow-inner">01</div>
                <div className="space-y-2">
                  <h4 className="text-lg font-bold text-white tracking-tight flex items-center gap-3">
                    イベント開催の実在性確認 <span className="text-slate-600 text-[10px] uppercase tracking-widest font-black hidden sm:inline">Evidence Check</span>
                  </h4>
                  <p className="text-slate-400 text-xs md:text-sm leading-relaxed font-medium">
                    イベント終了後、主催者より「会場でのQR設置写真」「開催報告のSNS公式投稿」等の証跡提出を義務付けます。運営側でこれらを確認・照合するまで、当該決済の清算はロック（保留）されます。
                  </p>
                </div>
              </div>

              <div className="flex gap-6 md:gap-10">
                <div className="flex-none w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-white text-xs font-black italic shadow-inner">02</div>
                <div className="space-y-2">
                  <h4 className="text-lg font-bold text-white tracking-tight flex items-center gap-3">
                    決済データの二重照合 <span className="text-slate-600 text-[10px] uppercase tracking-widest font-black hidden sm:inline">Reconciliation</span>
                  </h4>
                  <p className="text-slate-400 text-xs md:text-sm leading-relaxed font-medium">
                    決済代行会社（Stripe）の提供データと、システムDB内の支援ログを全件自動照合。1円の不一致も許さない突合確認を行います。
                  </p>
                </div>
              </div>

              <div className="flex gap-6 md:gap-10">
                <div className="flex-none w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-white text-xs font-black italic shadow-inner">03</div>
                <div className="space-y-2">
                  <h4 className="text-lg font-bold text-white tracking-tight flex items-center gap-3">
                    リスク待機期間の設定 <span className="text-slate-600 text-[10px] uppercase tracking-widest font-black hidden sm:inline">Chargeback Protection</span>
                  </h4>
                  <p className="text-slate-400 text-xs md:text-sm leading-relaxed font-medium">
                    クレジットカード決済特有のチャージバックリスクを考慮し、イベント終了から2週間のホールド期間を設定。この期間中に不正利用の申告がないことを確認した上で、最終的な支払い可能残高として確定させます。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
        
{/* --- Organizer Operation Flow Section --- */}
<section className="mb-32 relative py-20 bg-slate-900/30 border-y border-slate-800/50 rounded-[3rem] px-6">
  <div className="max-w-5xl mx-auto">
    <div className="text-center mb-16">
      <span className="text-pink-500 font-black italic tracking-[0.4em] text-[10px] uppercase mb-4 block">Standard Operating Procedure</span>
      <h3 className="text-3xl md:text-4xl font-black text-white italic tracking-tighter uppercase leading-tight">
        オーガナイザー業務フロー
      </h3>
      <p className="mt-4 text-slate-500 text-sm font-medium">
        イベントの企画から最終的な清算まで、透明性の高いガバナンスに基づいた標準フローを定義しています。
      </p>
    </div>

    <div className="relative">
      {/* 垂直ライン (Mobile/Desktop共通) */}
      <div className="absolute left-4 md:left-8 top-0 bottom-0 w-px bg-gradient-to-b from-pink-500 via-indigo-500 to-slate-800 opacity-20" />

      {[
        { 
          phase: "01", 
          title: "企画・登録", 
          time: "〜約開催1ヶ月前", 
          task: "イベント詳細・出演者の登録。口座未登録者のstripe onboardingを依頼。", 
          status: "Draft",
          icon: <Calendar size={18} />
        },
        { 
          phase: "02", 
          title: "ルール設定", 
          time: "随時", 
          task: "分配ルールを登録し、QRコードを準備。", 
          status: "Published",
          icon: <Zap size={18} />
        },
        { 
          phase: "03", 
          title: "現場運営", 
          time: "イベント当日", 
          task: "会場（DJブース等）へのQRコード設置。イベント開催の証跡となる写真撮影を推奨。", 
          status: "Live",
          important: true,
          icon: <Users size={18} />
        },
        { 
          phase: "04", 
          title: "実績報告", 
          time: "翌日〜5日以内", 
          task: "SNS報告URL、会場写真のアップロード。", 
          status: "Evidence Submitted",
          icon: <FileText size={18} />
        },
        { 
          phase: "05", 
          title: "照合・待機", 
          time: "開催後14日間", 
          task: "運営側での照合完了およびリスク監視（チャージバック等）の待機。", 
          status: "Locked / Verification",
          icon: <Lock size={18} />
        },
        { 
          phase: "06", 
          title: "清算確定", 
          time: "15日目〜", 
          task: "すべての照合が完了し、支払い可能残高（Payoutable）として確定。", 
          status: "Cleared",
          icon: <CheckCircle2 size={18} />
        },
        { 
          phase: "07", 
          title: "出金実行", 
          time: "任意", 
          task: "自身の銀行口座への出金指示（Stripe Payout）。", 
          status: "Paid Out",
          icon: <ExternalLink size={18} />
        }
      ].map((item, i) => (
        <div key={i} className="relative pl-12 md:pl-20 mb-10 last:mb-0 group">
          {/* Step Number Dot */}
          <div className={`absolute left-0 md:left-4 top-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 z-10 ${item.important ? 'bg-pink-500 border-pink-400 text-white shadow-[0_0_20px_rgba(236,72,153,0.4)]' : 'bg-slate-950 border-slate-700 text-slate-400 group-hover:border-indigo-500 group-hover:text-indigo-400'}`}>
            <span className="text-[10px] font-black italic">{item.phase}</span>
          </div>

          <div className="grid md:grid-cols-[1fr_2fr_1fr] gap-4 md:gap-8 items-start p-6 rounded-2xl bg-slate-900/40 border border-slate-800/50 hover:bg-slate-900/60 hover:border-slate-700 transition-all">
            {/* Phase & Time */}
            <div>
              <div className="flex items-center gap-2 text-indigo-400 mb-1">
                {item.icon}
                <span className="text-xs font-black uppercase tracking-tighter">{item.title}</span>
              </div>
              <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{item.time}</div>
            </div>

            {/* Task */}
            <div className="text-slate-300 text-sm font-medium leading-relaxed">
              {item.task}
            </div>

            {/* Status Indicator */}
            <div className="flex md:justify-end items-center">
              <span className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter border ${item.important ? 'bg-pink-500/10 border-pink-500/30 text-pink-400' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                {item.status}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
</section>
        {/* --- Contact --- */}
        <section className="text-center py-20 bg-gradient-to-br from-slate-900 to-slate-950 rounded-[3rem] border border-violet-500/10 shadow-3xl relative overflow-hidden flex flex-col items-center group mb-20">
          <div className="absolute inset-0 bg-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <h3 className="text-3xl md:text-4xl font-black text-white italic tracking-tighter uppercase mb-6 relative z-10 text-balance">お問い合わせ</h3>
          <p className="text-slate-400 font-medium leading-relaxed max-w-xl mb-12 relative z-10 text-pretty px-4">
            当サービスの導入をご希望のイベントオーガナイザー様、アーティスト様、および、システムに関するご質問はお気軽にご連絡ください。
          </p>
          <div className="flex flex-col md:flex-row gap-6 w-full justify-center px-10 relative z-10">
            <a href={mailUrl} className="flex items-center justify-center gap-3 bg-white text-slate-950 h-16 rounded-2xl font-black text-lg hover:bg-pink-500 hover:text-white transition-all w-full md:w-auto md:px-12 shadow-2xl tracking-tighter group">
              <Mail size={22} className="group-hover:animate-bounce" />
              SUPPORT@DIRECT-CHEERS.COM
            </a>
          </div>
        </section>
      </main>

      <footer className="py-24 px-6 border-t border-slate-800 bg-slate-950">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 text-pretty">
          <div className="flex flex-col gap-2">
            <p className="text-slate-600 text-[10px] font-mono italic tracking-widest uppercase">© 2026 Direct Cheers Platform.</p>
            <p className="text-slate-700 text-[8px] font-mono uppercase tracking-widest">Architected with Precision & Passion</p>
          </div>
          <Link href="/" className="text-slate-500 hover:text-pink-500 transition-colors text-xs font-bold uppercase tracking-widest">Back to Top</Link>
        </div>
      </footer>
    </div>
  );
}