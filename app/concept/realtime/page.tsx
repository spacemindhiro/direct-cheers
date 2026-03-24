import Link from "next/link";
import { Zap, ChevronLeft, Sparkles, MousePointer2 } from "lucide-react";

export default function RealtimeConcept() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <Link href="/" className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
        <ChevronLeft size={16} /> トップへ戻る
      </Link>
      
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
          <Zap className="text-yellow-600" size={28} />
        </div>
        <h1 className="text-3xl font-bold">リアルタイム演出連投</h1>
      </div>

      <div className="prose prose-neutral dark:prose-invert">
        <p className="text-xl leading-relaxed text-muted-foreground mb-8">
          あなたの「応援（Cheer）」が、その瞬間に会場の空気を変える。
        </p>

        <section className="space-y-8">
          <div className="p-6 bg-accent rounded-2xl border">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2 text-foreground">
              <Sparkles size={20} className="text-yellow-500" /> 0.1秒のレスポンス
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              投げ銭が行われた瞬間に、ステージ上のスクリーンやアーティストのデバイスへエフェクトを飛ばします。物理的な距離を超えた、双方向のコミュニケーションを実現します。
            </p>
          </div>

          <div className="p-6 bg-accent rounded-2xl border">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2 text-foreground">
              <MousePointer2 size={20} className="text-yellow-500" /> 「連投」が熱量になる
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              1回限りの決済ではなく、音楽やパフォーマンスのリズムに合わせてタップすることで、エフェクトが重なり、より大きな演出へと進化します。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}