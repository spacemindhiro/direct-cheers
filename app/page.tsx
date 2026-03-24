import Link from "next/link";
import { ArrowRight, Zap, Wallet, ShieldCheck } from "lucide-react";
import { Hero } from "@/components/hero";
import { ConnectSupabaseSteps } from "@/components/tutorial/connect-supabase-steps";
import { SignUpUserSteps } from "@/components/tutorial/sign-up-user-steps";

export default async function Index() {
  // hasEnvVarsのチェックをスキップし、環境変数は設定済みとして動作させます
  const isConfigured = true; 

  return (
    <div className="flex-1 w-full flex flex-col">
      <Hero />
      <main className="flex-1 flex flex-col gap-24 px-4 py-16">
        {/* --- コンセプト詳細リンク セクション --- */}
        <section className="max-w-5xl mx-auto w-full text-center">
          <h2 className="text-3xl font-bold mb-12">Service Concepts</h2>
          
          <div className="grid md:grid-cols-3 gap-8 text-left">
            {/* 1. リアルタイム演出 */}
            <Link 
              href="/concept/realtime" 
              className="flex flex-col p-8 border rounded-2xl hover:bg-accent hover:border-foreground transition-all group"
            >
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-6">
                <Zap className="text-yellow-600" size={28} />
              </div>
              <h3 className="text-xl font-bold mb-3 flex items-center group-hover:gap-2 transition-all">
                リアルタイム演出連投 <ArrowRight size={18} className="opacity-0 group-hover:opacity-100" />
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                応援の熱量をその場で視覚化。アーティストと繋がる最高の瞬間を演出します。
              </p>
            </Link>

            {/* 2. スマホウォレット */}
            <Link 
              href="/concept/wallet" 
              className="flex flex-col p-8 border rounded-2xl hover:bg-accent hover:border-foreground transition-all group"
            >
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
                <Wallet className="text-blue-600" size={28} />
              </div>
              <h3 className="text-xl font-bold mb-3 flex items-center group-hover:gap-2 transition-all">
                ウォレットに保存 <ArrowRight size={18} className="opacity-0 group-hover:opacity-100" />
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                感動の証をスマホへ。コレクションとして、いつでもどこでも振り返ることができます。
              </p>
            </Link>

            {/* 3. NFT技術 */}
            <Link 
              href="/concept/nft" 
              className="flex flex-col p-8 border rounded-2xl hover:bg-accent hover:border-foreground transition-all group"
            >
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-6">
                <ShieldCheck className="text-green-600" size={28} />
              </div>
              <h3 className="text-xl font-bold mb-3 flex items-center group-hover:gap-2 transition-all">
                NFTによる証跡管理 <ArrowRight size={18} className="opacity-0 group-hover:opacity-100" />
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                ブロックチェーンで刻む一生の思い出。唯一無二の応援証明を発行します。
              </p>
            </Link>
          </div>
        </section>

        {/* --- 既存のステップ表示セクション --- */}
        <div className="max-w-5xl mx-auto w-full border-t pt-16 text-center">
          <h2 className="font-medium text-xl mb-6">Start Your Experience</h2>
          {/* hasEnvVarsを使わず、直接コンポーネントを呼び出すことでビルドエラーを回避 */}
          {isConfigured ? <SignUpUserSteps /> : <ConnectSupabaseSteps />}
        </div>
      </main>
    </div>
  );
}