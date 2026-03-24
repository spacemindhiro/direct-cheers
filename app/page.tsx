import React from 'react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      {/* --- Navigation --- */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-violet-600 rounded-lg shadow-lg shadow-pink-500/20 group-hover:scale-110 transition-transform" />
            <h1 className="text-xl font-black tracking-tighter text-white uppercase">Direct Cheers</h1>
          </Link>
          
          <div className="hidden md:flex gap-8 text-sm font-medium">
            <Link href="#concept" className="hover:text-pink-500 transition-colors">コンセプト</Link>
            <Link href="#features" className="hover:text-pink-500 transition-colors">機能</Link>
            <Link href="/law" className="text-slate-400 hover:text-white underline decoration-pink-500/50 transition-colors">
              特定商取引法
            </Link>
          </div>

          <button className="bg-white text-slate-950 px-5 py-2 rounded-full text-sm font-bold hover:bg-pink-500 hover:text-white transition-all shadow-xl shadow-white/5">
            JOIN NOW
          </button>
        </div>
      </nav>

      {/* --- Hero Section: 熱狂と体験をメインに --- */}
      <section id="concept" className="relative py-24 px-6 overflow-hidden border-b border-slate-900">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-pink-500/5 blur-[120px] rounded-full -z-10" />
        
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-4 py-1.5 rounded-full border border-slate-800 text-slate-400 text-[10px] font-bold tracking-[0.2em] uppercase mb-8 bg-slate-900/50">
            Live Event Support Platform
          </span>
          <h2 className="text-5xl md:text-7xl font-black mb-8 tracking-tighter text-white leading-[1.1]">
            ライブの感動を、<br />
            <span className="bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent">
              「一生モノ」の証に。
            </span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed mb-12">
            Direct Cheersは、会場のQRコードからアーティストを直接応援できるプラットフォームです。
            あなたの支援は、シリアルナンバー入りの「デジタル証明書」として永久に記録されます。
          </p>
          <div className="flex justify-center gap-4">
            <Link href="#features" className="bg-slate-100 text-slate-900 px-8 py-4 rounded-full font-bold hover:bg-pink-500 hover:text-white transition-all shadow-lg">
              詳しく見る
            </Link>
          </div>
        </div>
      </section>

      {/* --- Features Section: NFTを「技術的裏付け」として紹介 --- */}
      <section id="features" className="py-24 bg-slate-950 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-12">
            
            {/* Feature 1: 応援体験 */}
            <div className="space-y-4 text-center md:text-left">
              <div className="text-pink-500 font-black text-4xl italic mb-2">01</div>
              <h4 className="text-xl font-bold text-white">アーティストを直接応援</h4>
              <p className="text-sm text-slate-400 leading-relaxed">
                今、目の前のステージで輝くアーティストに、1クリックで応援の気持ち（Cheers!）を届けられます。
              </p>
            </div>

            {/* Feature 2: デジタルギフト（NFTの役割） */}
            <div className="space-y-4 text-center md:text-left border-y md:border-y-0 md:border-x border-slate-800 py-12 md:py-0 md:px-12">
              <div className="text-violet-500 font-black text-4xl italic mb-2">02</div>
              <h4 className="text-xl font-bold text-white">デジタル証明書の受取</h4>
              <p className="text-sm text-slate-400 leading-relaxed text-left">
                応援の証として、限定フライヤーをデジタル納品。
                <span className="text-slate-300">NFT技術により</span>、改ざん不可能な所有証明があなたに付与されます。
              </p>
            </div>

            {/* Feature 3: 安心の証跡管理 */}
            <div className="space-y-4 text-center md:text-left">
              <div className="text-indigo-500 font-black text-4xl italic mb-2">03</div>
              <h4 className="text-xl font-bold text-white">信頼の証跡管理</h4>
              <p className="text-sm text-slate-400 leading-relaxed text-left">
                すべてのアセット閲覧ログを厳格に管理。
                正当なデジタル取引であることをプラットフォームが保証し、アーティストの権利を守ります。
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* --- Trust Badge: Stripe審査を意識 --- */}
      <section className="py-12 bg-slate-900/30 border-t border-slate-900">
        <div className="max-w-4xl mx-auto px-6 flex flex-wrap justify-center items-center gap-8 opacity-50 grayscale transition-all hover:grayscale-0">
          <span className="text-xs font-bold tracking-widest text-slate-500">POWERED BY SECURE PAYMENT SYSTEMS</span>
          {/* ここに将来的にStripeなどのロゴを配置 */}
        </div>
      </section>

      {/* --- Footer Area --- */}
      <footer className="py-20 px-6 border-t border-slate-800 bg-slate-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="space-y-4">
            <h5 className="font-bold text-white tracking-tighter">DIRECT CHEERS</h5>
            <p className="text-slate-500 text-[10px] max-w-xs leading-relaxed">
              ライブの感動をデジタル化し、アーティストの持続可能な活動を支援する。
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-12 sm:gap-20">
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.2em] mb-6">Service</h6>
              <ul className="text-slate-500 text-xs space-y-4">
                <li><Link href="/#concept" className="hover:text-white">コンセプト</Link></li>
                <li><Link href="/#features" className="hover:text-white">機能詳細</Link></li>
              </ul>
            </div>
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.2em] mb-6">Legal</h6>
              <ul className="text-slate-500 text-xs space-y-4">
                <li><Link href="/terms" className="hover:text-white">利用規約</Link></li>
                <li><Link href="/law" className="text-pink-500 font-bold hover:underline">特定商取引法</Link></li>
              </ul>
            </div>
            <div>
              <h6 className="text-white font-bold text-[10px] uppercase tracking-[0.2em] mb-6">Contact</h6>
              <ul className="text-slate-500 text-xs space-y-4">
                <li><Link href="/contact" className="hover:text-white">お問い合わせ</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-20 pt-8 border-t border-slate-900 text-center">
          <p className="text-slate-600 text-[10px]">© 2026 Direct Cheers. Empowering Live Moments.</p>
        </div>
      </footer>
    </div>
  );
}