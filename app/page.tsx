import React from 'react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      {/* Navigation: 審査官が法務ページを探しやすく配置 */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-violet-600 rounded-lg shadow-lg shadow-pink-500/20" />
            <h1 className="text-xl font-black tracking-tighter text-white">DIRECT CHEERS</h1>
          </div>
          <div className="hidden md:flex gap-8 text-sm font-medium">
            <a href="#concept" className="hover:text-pink-500 transition-colors">コンセプト</a>
            <a href="#products" className="hover:text-pink-500 transition-colors">商品内容</a>
            <a href="/law" className="text-slate-400 hover:text-white underline decoration-pink-500/50">特定商取引法</a>
          </div>
          <button className="bg-white text-slate-950 px-5 py-2 rounded-full text-sm font-bold hover:bg-pink-500 hover:text-white transition-all">
            Coming Soon
          </button>
        </div>
      </nav>

      {/* Hero: 何を売っているかを1秒で伝える */}
      <section className="relative py-24 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-pink-500/10 blur-[120px] rounded-full -z-10" />
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-4 py-1.5 rounded-full border border-pink-500/30 text-pink-500 text-xs font-bold tracking-widest uppercase mb-6 bg-pink-500/5">
            Digital Asset Platform
          </span>
          <h2 className="text-5xl md:text-7xl font-black mb-8 tracking-tight text-white leading-[1.1]">
            ライブの熱狂を、<br />
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              「デジタル証跡」
            </span>
            として手元に。
          </h2>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-12">
            Direct Cheersは、イベント会場のQRコードから、今この瞬間の感動を「シリアル入りデジタルフライヤー」として購入・コレクションできる、アーティスト支援プラットフォームです。
          </p>
        </div>
      </section>

      {/* Product Section: 「寄付ではない」ことを証明するセクション */}
      <section id="products" className="py-24 bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-white mb-4">販売商品：Cheers! Digital Card</h3>
            <p className="text-slate-400">決済完了後、ブラウザ上で即時に納品・閲覧が可能です。</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-slate-950 border border-slate-800 hover:border-pink-500/50 transition-all group">
              <div className="w-12 h-12 bg-pink-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-pink-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16" /></svg>
              </div>
              <h4 className="text-xl font-bold text-white mb-4">世界に一つのシリアル</h4>
              <p className="text-slate-400 leading-relaxed text-sm">
                決済順に基づいたユニークなシリアルナンバーがフライヤー画像に刻印されます。
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-950 border border-slate-800 hover:border-violet-500/50 transition-all group">
              <div className="w-12 h-12 bg-violet-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-violet-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              </div>
              <h4 className="text-xl font-bold text-white mb-4">限定サンクスメッセージ</h4>
              <p className="text-slate-400 leading-relaxed text-sm">
                購入者だけがマイページから閲覧できる、アーティスト書き下ろしのメッセージを同梱。
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 transition-all group">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-indigo-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h4 className="text-xl font-bold text-white mb-4">法的証跡の記録</h4>
              <p className="text-slate-400 leading-relaxed text-sm">
                アセットの閲覧ログを記録し、正当なデジタル取引であることをプラットフォームが保証。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer: 法務リンクの要塞 */}
      <footer className="py-20 px-6 border-t border-slate-800 bg-slate-950">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 bg-white/10 rounded" />
              <h5 className="font-bold text-white tracking-tighter">DIRECT CHEERS</h5>
            </div>
            <p className="text-slate-500 text-xs max-w-xs">
              Direct Cheersは、ライブエンターテインメントの持続可能性をデジタル技術で支援します。
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-12">
            <div>
              <h6 className="text-white font-bold text-sm mb-4">サービス</h6>
              <ul className="text-slate-500 text-xs space-y-3">
                <li><a href="#" className="hover:text-white transition-colors">利用方法</a></li>
                <li><a href="#" className="hover:text-white transition-colors">よくある質問</a></li>
              </ul>
            </div>
            <div>
              <h6 className="text-white font-bold text-sm mb-4">法務・規約</h6>
              <ul className="text-slate-500 text-xs space-y-3">
                <li><a href="/terms" className="hover:text-white transition-colors">利用規約</a></li>
                <li><a href="/privacy" className="hover:text-white transition-colors">プライバシーポリシー</a></li>
                <li><a href="/law" className="text-pink-500 font-bold hover:underline transition-colors">特定商取引法に基づく表記</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-20 pt-8 border-t border-slate-900 text-center">
          <p className="text-slate-600 text-[10px]">© 2026 Direct Cheers All Rights Reserved.</p>
        </div>
      </footer>
    </div>
  );
}