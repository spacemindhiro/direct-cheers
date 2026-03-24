import Link from "next/link";
import { Wallet, ChevronLeft, Smartphone, Download } from "lucide-react";

export default function WalletConcept() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20">
      <Link href="/" className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
        <ChevronLeft size={16} /> トップへ戻る
      </Link>
      
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
          <Wallet className="text-blue-600" size={28} />
        </div>
        <h1 className="text-3xl font-bold">スマホのウォレットに保存</h1>
      </div>

      <div className="prose prose-neutral dark:prose-invert">
        <p className="text-xl leading-relaxed text-muted-foreground mb-8">
          イベントの感動を、ポケットの中に。
        </p>

        <section className="space-y-8">
          <div className="p-6 bg-accent rounded-2xl border">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
              <Smartphone size={20} className="text-blue-500" /> デジタル・メモリアル
            </h2>
            <p>
              応援の対価として発行されるデジタルカードやサンクスパスを、Apple WalletやGoogle Payに直接保存。アプリを開かなくても、いつでも思い出にアクセスできます。
            </p>
          </div>

          <div className="p-6 bg-accent rounded-2xl border">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
              <Download size={20} className="text-blue-500" /> オフラインでも確認可能
            </h2>
            <p>
              ウォレット標準機能を使うため、通信環境が悪くても「自分がその場所にいた証」を提示したり、見返したりすることが可能です。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}