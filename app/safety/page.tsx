import React from "react";
import { ShieldCheck, UserCheck, FileSearch, CheckCircle2, BadgePercent, Lock } from "lucide-react";

export default function SafetyPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-16">
      {/* ヒーローセクション */}
      <section className="text-center space-y-4">
        <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl">
          安心・安全への取り組み
        </h1>
        <p className="text-muted-foreground text-lg">
          Direct Cheersは、日本の法令を遵守し、アーティストとファンを繋ぐ決済の正当性を担保します。
        </p>
      </section>

      {/* 1. 3段階の厳格な審査プロセス */}
      <section className="space-y-8">
        <h2 className="text-2xl font-semibold border-l-4 border-primary pl-4">
          1. 3段階の厳格な審査プロセス
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="p-6 border rounded-xl bg-card">
            <UserCheck className="w-10 h-10 text-primary mb-4" />
            <h3 className="font-bold mb-2">① 連結アカウント審査</h3>
            <p className="text-sm text-muted-foreground">
              全加盟店（オーガナイザー・DJ）に対し、活動実績と本人確認を実施。プラットフォームによる承認後のみ、決済の受領が可能になります。
            </p>
          </div>
          <div className="p-6 border rounded-xl bg-card">
            <FileSearch className="w-10 h-10 text-primary mb-4" />
            <h3 className="font-bold mb-2">② 対価の正当性審査</h3>
            <p className="text-sm text-muted-foreground">
              提供されるデジタルコンテンツ（Cheers!カード）の価値と決済額が妥当かを事前に審査。承認前のQR決済はシステムで遮断されます。
            </p>
          </div>
          <div className="p-6 border rounded-xl bg-card">
            <CheckCircle2 className="w-10 h-10 text-primary mb-4" />
            <h3 className="font-bold mb-2">③ イベント開催確認</h3>
            <p className="text-sm text-muted-foreground">
              イベント終了後、実施を証明するエビデンス（写真・記録）を提出。運営が開催を確認するまで売上の引き出しをロックします。
            </p>
          </div>
        </div>
      </section>

      {/* 2. 資金フローと手数料体系 */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold border-l-4 border-primary pl-4">
          2. 資金フローの透明性
        </h2>
        <div className="p-8 border rounded-xl bg-secondary/30">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <ul className="space-y-4 text-sm md:text-base">
              <li className="flex justify-between border-b pb-2">
                <span>オーガナイザー・出演者配分</span>
                <span className="font-bold text-primary">86.4%</span>
              </li>
              <li className="flex justify-between border-b pb-2 text-muted-foreground">
                <span>プラットフォーム手数料（運営・代理店）</span>
                <span>10.0%</span>
              </li>
              <li className="flex justify-between border-b pb-2 text-muted-foreground">
                <span>Stripe 決済手数料</span>
                <span>3.6%</span>
              </li>
            </ul>
            <div className="text-sm text-muted-foreground p-4 bg-background rounded-lg border italic">
              「Stripeの決済ログ」と「システム内部の取引ログ」を全件照合。1円の乖離も許さないデータ整合性を担保してから出金処理へ移行します。
            </div>
          </div>
        </div>
      </section>

      {/* 3. リスク管理と保護機能 */}
      <section className="space-y-8">
        <h2 className="text-2xl font-semibold border-l-4 border-primary pl-4">
          3. リスク管理と保護
        </h2>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="flex gap-4 p-4 border rounded-lg">
            <div className="bg-primary/10 p-3 rounded-full h-fit">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-bold uppercase text-xs text-primary mb-1">Chargeback Protection</h3>
              <h4 className="font-semibold mb-2">2週間の待機期間設定</h4>
              <p className="text-sm text-muted-foreground">
                不適切な取引やチャージバックのリスクを抑えるため、決済完了から出金可能になるまで最短2週間のバッファを設けています。
              </p>
            </div>
          </div>
          <div className="flex gap-4 p-4 border rounded-lg">
            <div className="bg-primary/10 p-3 rounded-full h-fit">
              <BadgePercent className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-bold uppercase text-xs text-primary mb-1">KYC / AML</h3>
              <h4 className="font-semibold mb-2">反社会的勢力の排除</h4>
              <p className="text-sm text-muted-foreground">
                StripeのKYC（本人確認）プロセスと連携し、マネーロンダリング防止および反社会的勢力との取引排除を徹底しています。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 結び */}
      <footer className="pt-12 text-center text-sm text-muted-foreground border-t">
        <p>© 2026 Direct Cheers. サービス提供元：[運営会社/個人名]</p>
      </footer>
    </div>
  );
}