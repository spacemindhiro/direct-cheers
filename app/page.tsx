import Link from "next/link";
import { ArrowRight, Zap, Wallet, ShieldCheck } from "lucide-react";

// Named Exportの修正を反映
import { Hero } from "@/components/hero";
import { SignUpUserSteps } from "@/components/tutorial/sign-up-user-steps";

export default async function Index() {
  return (
    <div className="flex-1 w-full flex flex-col bg-[#fafafa] text-[#1a1a1a]">
      {/* ヒーローセクション：昨日のシュッとしたやつ */}
      <Hero />

      <main className="flex-1 flex flex-col gap-32 px-6 py-24 max-w-[1200px] mx-auto w-full">
        
        {/* コンセプトセクション：イタリアン・グリッド */}
        <section>
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
            <h2 className="text-5xl font-extrabold tracking-tighter leading-none uppercase italic">
              Core<br />Concepts
            </h2>
            <p className="text-muted-foreground max-w-[300px] text-sm leading-relaxed border-l pl-4 border-black/10">
              デジタル応援を「一過性の決済」から「一生の証」へ昇華させる3つの柱。
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-[1px] bg-black/5 border border-black/5 overflow-hidden rounded-3xl">
            {/* 1. リアルタイム演出 */}
            <Link 
              href="/concept/realtime" 
              className="flex flex-col p-10 bg-white hover:bg-[#f0f0f0] transition-colors group relative"
            >
              <Zap className="mb-12 text-black group-hover:scale-110 transition-transform" size={32} strokeWidth={1.5} />
              <h3 className="text-2xl font-bold mb-4 tracking-tight flex items-center justify-between">
                Realtime <ArrowRight size={20} className="-rotate-45 group-hover:rotate-0 transition-transform" />
              </h3>
              <p className="text-[#666] text-sm leading-relaxed mb-8">
                応援の熱量をその場で視覚化。0.1秒のレスポンスがアーティストとあなたを繋ぎます。
              </p>
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/30">演出連投</span>
            </Link>

            {/* 2. スマホウォレット */}
            <Link 
              href="/concept/wallet" 
              className="flex flex-col p-10 bg-white hover:bg-[#f0f0f0] transition-colors group relative"
            >
              <Wallet className="mb-12 text-black group-hover:scale-110 transition-transform" size={32} strokeWidth={1.5} />
              <h3 className="text-2xl font-bold mb-4 tracking-tight flex items-center justify-between">
                Wallet <ArrowRight size={20} className="-rotate-45 group-hover:rotate-0 transition-transform" />
              </h3>
              <p className="text-[#666] text-sm leading-relaxed mb-8">
                感動の証をポケットに。Apple Wallet等へ直接保存し、いつでも思い出を呼び出せます。
              </p>
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/30">所有体験</span>
            </Link>

            {/* 3. NFT技術 */}
            <Link 
              href="/concept/nft" 
              className="flex flex-col p-10 bg-white hover:bg-[#f0f0f0] transition-colors group relative"
            >
              <ShieldCheck className="mb-12 text-black group-hover:scale-110 transition-transform" size={32} strokeWidth={1.5} />
              <h3 className="text-2xl font-bold mb-4 tracking-tight flex items-center justify-between">
                Proven <ArrowRight size={18} className="-rotate-45 group-hover:rotate-0 transition-transform" />
              </h3>
              <p className="text-[#666] text-sm leading-relaxed mb-8">
                改ざん不能な応援証明。あなたの支援は、ブロックチェーンに刻まれた歴史になります。
              </p>
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/30">証跡管理</span>
            </Link>
          </div>
        </section>

        {/* 登録セクション：シンプルに配置 */}
        <section className="border-t border-black/5 pt-24 pb-12 flex flex-col items-center">
          <div className="max-w-md w-full text-center">
            <h2 className="text-sm font-bold uppercase tracking-[0.3em] mb-12 text-black/40">Next Experience</h2>
            <SignUpUserSteps />
          </div>
        </section>
      </main>

      <footer className="p-8 text-center text-[10px] uppercase tracking-widest text-black/20">
        &copy; 2026 Direct Cheers. All rights reserved.
      </footer>
    </div>
  );
}