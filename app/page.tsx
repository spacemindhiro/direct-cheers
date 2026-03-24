// ... 前後のナビゲーション等は維持 ...

      {/* Hero: 「所有」を強調 */}
      <section className="relative py-24 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-pink-500/10 blur-[120px] rounded-full -z-10" />
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-4 py-1.5 rounded-full border border-pink-500/30 text-pink-500 text-xs font-bold tracking-widest uppercase mb-6 bg-pink-500/5">
            Next-Gen Digital Ownership
          </span>
          <h2 className="text-5xl md:text-7xl font-black mb-8 tracking-tight text-white leading-[1.1]">
            その感動を、<br />
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              NFTで「所有」する。
            </span>
          </h2>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-12">
            Direct Cheersは、ライブの証をNFTとして発行。
            ブロックチェーンに刻まれた「あなただけの所有証明」が、デジタルアセットに唯一無二の価値を与えます。
          </p>
        </div>
      </section>

      {/* Product Section: NFTのメリットを具体化 */}
      <section id="products" className="py-24 bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-white mb-4">NFT Digital Asset</h3>
            <p className="text-slate-400">すべてのCheers!はポリゴンネットワーク（予定）上でNFT化され、あなたのウォレットに届けられます。</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-slate-950 border border-slate-800 hover:border-pink-500/50 transition-all group">
              <div className="w-12 h-12 bg-pink-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-pink-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h4 className="text-xl font-bold text-white mb-4">永久的な所有証明</h4>
              <p className="text-slate-400 leading-relaxed text-sm">
                ブロックチェーン技術により、あなたがその瞬間に会場にいた証、そしてアーティストを支援した事実が永久に記録されます。
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-950 border border-slate-800 hover:border-violet-500/50 transition-all group">
              <div className="w-12 h-12 bg-violet-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-violet-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              </div>
              <h4 className="text-xl font-bold text-white mb-4">NFTマーケット対応</h4>
              <p className="text-slate-400 leading-relaxed text-sm">
                発行されたアセットはOpenSeaなどの外部マーケットプレイスでの表示・管理が可能です（※二次流通制限の設定も可能）。
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 transition-all group">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-indigo-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h4 className="text-xl font-bold text-white mb-4">ガス代不要の体験</h4>
              <p className="text-slate-400 leading-relaxed text-sm">
                独自のミントエンジンにより、ユーザーは暗号資産やガス代を意識することなく、クレジットカード決済のみでNFTを所有できます。
              </p>
            </div>
          </div>
        </div>
      </section>

// ... 以下フッターへ続く ...