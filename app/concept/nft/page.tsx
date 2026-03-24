import Link from "next/link";
import { ShieldCheck, ChevronLeft, Database, Award } from "lucide-react";

export default function NftConcept() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <Link href="/" className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
        <ChevronLeft size={16} /> トップへ戻る
      </Link>
      
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
          <ShieldCheck className="text-green-600" size={28} />
        </div>
        <h1 className="text-3xl font-bold">NFT技術による証跡管理</h1>
      </div>

      <div className="prose prose-neutral dark:prose-invert">
        <p className="text-xl leading-relaxed text-muted-foreground mb-8">
          あなたの応援は、改ざん不可能な「歴史」になる。
        </p>

        <section className="space-y-8">
          <div className="p-6 bg-accent rounded-2xl border">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
              <Database size={20} className="text-green-600" /> ブロックチェーンによる証明
            </h2>
            <p>
              すべてのCheer（応援）履歴は、分散型台帳技術を用いて記録されます。運営会社が消えても、あなたの応援の事実はネットワーク上に永続的に残り続けます。
            </p>
          </div>

          <div className="p-6 bg-accent rounded-2xl border">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
              <Award size={20} className="text-green-600" /> 唯一無二のシリアル番号
            </h2>
            <p>
              発行されるデジタルコンテンツにはすべて固有のIDが付与され、所有権が明確に定義されます。これは将来的に、アーティストからの特別な特典（先行予約権など）の鍵となります。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}