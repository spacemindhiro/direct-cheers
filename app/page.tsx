import React from 'react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      {/* --- Navigation: 審査官への信頼の入り口 --- */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-violet-600 rounded-lg shadow-lg shadow-pink-500/20 group-hover:scale-110 transition-transform" />
            <h1 className="text-xl font-black tracking-tighter text-white uppercase">Direct Cheers</h1>
          </Link>
          
          <div className="hidden md:flex gap-8 text-sm font-medium">
            <Link href="#concept" className="hover:text-pink-500 transition-colors">コンセプト</Link>
            <Link href="#features" className="hover:text-pink-500 transition-colors">機能・体験</Link>
            <Link href="/law" className="text-slate-400 hover:text-white underline decoration-pink-500/50 transition-colors">
              特定商取引法
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <button className="bg-white text-slate-950 px-5 py-2 rounded-full text-sm font-bold hover:bg-pink-500 hover:text-white transition-all shadow-xl shadow-white/5">
              COMING SOON
            </button>
          </div>
        </div>
      </nav>

      {/* --- Hero Section: 熱狂を一生モノにする --- */}
      <section id="concept" className="relative py-28 px-6 overflow-hidden border-b border-slate-900">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-pink-500/5 blur-[120px] rounded-full -z-10" />
        
        <div className="max-w-5xl mx-auto text-center">
          <span className="inline-block px-4 py-1.5 rounded-full border border-slate-800 text-slate-400 text-[10px] font-bold tracking-[0.2em] uppercase mb-8 bg-slate-900/50">
            Interactive Live Experience Platform
          </span>
          <h2 className="text-5xl md:text-8xl font-black mb-10 tracking-tighter text-white leading-[1.05]">
            ライブの熱狂を、<br />
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              「景色」と「証」に。
            </span>
          </h2>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-12">
            Direct Cheersは、会場のQRコードからステージを直接応援できるプラットフォーム。<br className="hidden md:block" />
            あなたの応援が、その瞬間の「演出」となり、一生消えない「所有証明」へと変わります。
          </p>
          <div className="flex justify-center gap-6">
            <Link href="#features" className="bg-slate-100 text-slate-900 px-10 py-4 rounded-full font-bold hover:bg-pink-500 hover:text-white transition-all shadow-2xl">
              体験を詳しく知る
            </Link>
          </div>
        </div>
      </section>

      {/* --- Features Section: 3つのコア体験 --- */}
      <section id="features" className="py-24 bg-slate-950 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h3 className="text-4xl font-black text-white mb-4 italic tracking-tighter uppercase">The Cheers Experience</h3>
            <p className="text-slate-500">デジタルとリアルが交差する、新しい応援のカタチ</p>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            
            {/* 01: 演出連動 - PMのコダワリセクション */}
            <div className="p-10 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-pink-500/20 shadow-2xl relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-pink-500/10 blur-3xl group-hover:bg-pink-500/20 transition-all" />
              <div className="text-pink-500 font-black text-5xl italic mb-6">01</div>
              <h4 className="text-2xl font-bold text-white mb-4">リアルタイム演出連動</h4>
              <p className="text-sm text-slate-400 leading-relaxed text-left">
                あなたの応援（Cheers!）が、会場のVJスクリーンや照明、音響システムとダイレクトに連携。
                「その瞬間、その場所」だけの特別な演出を、あなたの手で創り出します。
              </p>
            </div>

            {/* 02: NFT所有証明 - 技術的裏付け */}
            <div className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800 hover:border-violet-500/40 transition-all group">
              <div className="text-violet-500 font-black text-5xl italic mb-6">02</div>
              <h4 className="text-2xl font-bold text-white mb-4">NFTによるデジタル所有</h4>
              <p className="text-sm text-slate-400 leading-relaxed text-left">
                演出に参加した証として、シリアル入りデジタル証明書（限定アセット）を即時発行。
                NFT技術（Polygon）を採用し、改ざん不可能な「一生モノのコレクション」として保有できます。
              </p>
            </div>

            {/* 03: 証跡管理 - 審査官への信頼 */}
            <div className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800 hover:border-indigo-500/40 transition-all">
              <div className="text-indigo-500 font-black text-5xl italic mb-6 text-left">03</div>
              <h4 className="text-2xl font-bold text-white mb-4 text-left">厳格な証跡管理基盤</h4>
              <p className="text-sm text-slate-400 leading-relaxed text-left">
                すべてのアセット閲覧ログを記録し、正当なデジタル取引であることをプラットフォームが保証。
                チャージバックリスクを最小化し、アーティストへの適正な還元を実現します。
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* --- Visual Asset Preview: イメージを想起させる --- */}
      <section className="py-20 bg-slate-900/20 border-t border-slate-900 overflow-hidden">
         <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center gap-16">
            <div className="flex-1 space-y-6">
                <h3 className="text-3xl font-bold text-white">Digital Cheers Card</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                   決済完了後、あなたの名前・日付・シリアルがリアルタイムに合成され、ブロックチェーンに刻印。
                   ブラウザ上のマイページから、いつでもその日の熱狂を振り返ることができます。
                </p>
                <div className="flex gap-4">
                    <div className="px-3 py-1 bg-slate-800 rounded text-[10px] text-slate-300 border border-slate-700 font-mono">Serial: DC-2026-XXXX</div>
                    <div className="px-3 py-1 bg-slate-800 rounded text-[10px] text-slate-300 border border-slate-700 font-mono">Network: Polygon</div>
                </div>
            </div>
            <div className="flex-1 w-full max-w-sm aspect-[3/4] bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl border border-slate-700 shadow-2xl relative flex items-center justify-center italic text-slate-700 font-black text-2xl">
                Asset Preview
            </div>
         </div>
      </section>

      {/* --- Footer Area --- */}
      <footer className="py-24 px-6 border-t border-slate-800 bg-slate-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-16">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-white/10 rounded" />
              <h5 className="font-bold text-white tracking-tighter">DIRECT CHEERS</h5>
            </div>
            <p className="text-slate-500 text-[10px] max-w-xs leading-relaxed uppercase tracking-widest">
              Empowering artists and fans through digital asset technology.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-16 sm:gap-24">
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Navigation</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-medium">
                <li><Link href="/#concept" className="hover:text-pink-500 transition-colors">コンセプト</Link></li>
                <li><Link href="/#features" className="hover:text-pink-500 transition-colors">機能体験</Link></li>
                <li><button className="text-slate-700 cursor-not-allowed">マーケットプレイス</button></li>
              </ul>
            </div>
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Compliance</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-medium">
                <li><Link href="/terms" className="hover:text-white transition-colors">利用規約</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">プライバシーポリシー</Link></li>
                <li><Link href="/law" className="text-pink-500 font-bold hover:underline transition-all">特定商取引法に基づく表記</Link></li>
              </ul>
            </div>
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.3em] mb-8">Connect</h6>
              <ul className="text-slate-500 text-[11px] space-y-4 font-medium">
                <li><Link href="/contact" className="hover:text-white transition-colors">お問い合わせフォーム</Link></li>
                <li><a href="https://x.com" target="_blank" className="hover:text-white transition-colors italic">Official X</a></li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto mt-24 pt-8 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-600 text-[10px] font-mono">© 2026 Direct Cheers Platform. All Rights Reserved.</p>
          <div className="flex gap-4 opacity-40 hover:opacity-100 transition-opacity">
             <div className="w-8 h-4 bg-slate-800 rounded sm" />
             <div className="w-8 h-4 bg-slate-800 rounded sm" />
          </div>
        </div>
      </footer>
    </div>
  );
}