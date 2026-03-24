import Link from "next/link";
import { ArrowRight, Zap, Wallet, ShieldCheck } from "lucide-react";
import { Hero } from "@/components/hero";
import { SignUpUserSteps } from "@/components/tutorial/sign-up-user-steps";

export default async function Index() {
  return (
    <div className="flex-1 w-full flex flex-col bg-black text-white selection:bg-white selection:text-black">
      {/* ヒーローセクション */}
      <Hero />

      <main className="flex-1 flex flex-col gap-32 px-6 py-24 max-w-[1200px] mx-auto w-full">
        
        {/* コンセプトセクション：黒背景に極細の境界線 */}
        <section>
          <div className="flex flex-col mb-16 gap-4">
            <h2 className="text-4xl font-bold tracking-tighter uppercase">
              Core Concepts
            </h2>
            <div className="h-[1px] w-24 bg-white/20" />
          </div>
          
          <div className="grid md:grid-cols-3 gap-[1px] bg-white/10 border border-white/10 overflow-hidden rounded-2xl">
            {/* 1. リアルタイム演出 */}
            <Link 
              href="/concept/realtime" 
              className="flex flex-col p-10 bg-black hover:bg-[#111] transition-all group"
            >
              <Zap className="mb-12 text-white/80 group-hover:text-yellow-400 transition-colors" size={32} strokeWidth={1} />
              <h3 className="text-xl font-bold mb-4 tracking-tight flex items-center justify-between">
                Realtime <ArrowRight size={18} className="-rotate-45 group-hover:rotate-0 transition-transform" />
              </h3>
              <p className="text-white/50 text-sm leading-relaxed">
                応援の熱量をその場で視覚化。0.1秒のレスポンスがアーティストとあなたを繋ぎます。
              </p>
            </Link>

            {/* 2. スマホウォレット */}
            <Link 
              href="/concept/wallet" 
              className="flex flex-col p-10 bg-black hover:bg-[#111] transition-all group"
            >
              <Wallet className="mb-12 text-white/80 group-hover:text-blue-400 transition-colors" size={32} strokeWidth={1} />
              <h3 className="text-xl font-bold mb-4 tracking-tight flex items-center justify-between">
                Wallet <ArrowRight size={18} className="-rotate-45 group-hover:rotate-0 transition-transform" />
              </h3>
              <p className="text-white/50 text-sm leading-relaxed">
                感動の証をポケットに。Apple Wallet等へ直接保存し、いつでも思い出を呼び出せます。
              </p>
            </Link>

            {/* 3. NFT技術 */}
            <Link 
              href="/concept/nft" 
              className="flex flex-col p-10 bg-black hover:bg-[#111] transition-all group"
            >
              <ShieldCheck className="mb-12 text-white/80 group-hover:text-green-400 transition-colors" size={32} strokeWidth={1} />
              <h3 className="text-xl font-bold mb-4 tracking-tight flex items-center justify-between">
                Proven <ArrowRight size={18} className="-rotate-45 group-hover:rotate-0 transition-transform" />
              </h3>
              <p className="text-white/50 text-sm leading-relaxed">
                改ざん不能な応援証明。あなたの支援は、ブロックチェーンに刻まれた歴史になります。
              </p>
            </Link>
          </div>
        </section>

        {/* 登録セクション */}
        <section className="border-t border-white/10 pt-24 pb-12 flex flex-col items-center">
          <div className="max-w-md w-full text-center">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.4em] mb-12 text-white/30">Next Experience</h2>
            <div className="bg-white/5 p-8 rounded-2xl border border-white/10">
                <SignUpUserSteps />
            </div>
          </div>
        </section>
      </main>

      <footer className="p-8 text-center text-[10px] uppercase tracking-[0.5em] text-white/20">
        &copy; 2026 Direct Cheers.
      </footer>
    </div>
  );
}