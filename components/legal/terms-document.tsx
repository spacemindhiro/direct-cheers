import Link from 'next/link';
import { ShieldCheck, AlertTriangle } from "lucide-react";

// 利用規約の本文（タイトル行＋全条文）。公開ページ /terms と、ログイン後の
// /dashboard/profile/terms の両方で使う。条文はここだけを編集すること。
// privacyHref: 第1条内のプライバシーポリシーへのリンク先（表示している側の画面に合わせる）
export function TermsDocument({ privacyHref = "/privacy" }: { privacyHref?: string }) {
  return (
    <>
      <div className="flex items-center gap-4 mb-12 border-b border-slate-800 pb-8">
        <ShieldCheck className="text-pink-500" size={28} />
        <h1 className="text-2xl md:text-3xl font-black italic text-white uppercase tracking-tight">利用規約</h1>
        <span className="ml-auto text-[10px] text-slate-500 font-mono italic text-right">Last Updated: 2026.10.08</span>
      </div>

      <div className="space-y-10 text-[13px] md:text-sm leading-relaxed">

        <section>
          <h2 className="text-base font-bold text-white mb-3 italic border-l-2 border-pink-500 pl-3">第1条（適用およびユーザー登録）</h2>
          <p className="mb-3">本規約は、Direct Cheers（以下「本サービス」）の利用条件を定めるものです。本サービスを利用する全てのユーザーは、本規約に同意したものとみなされます。</p>
          <p>本サービスにおいてアカウント未登録のユーザーが決済手続きを行った場合、当該手続きの完了をもってユーザー登録の申請がなされ、本規約および<Link href={privacyHref} className="text-pink-400 hover:text-pink-300 underline underline-offset-2">プライバシーポリシー</Link>に同意したものとみなします。</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-3 italic border-l-2 border-pink-500 pl-3">第2条（サービスの定義）</h2>
          <p>本サービスは、ライブイベントにおいてアーティストに対し応援（Cheers!）を贈ることで、リアルタイムの演出参加および、その証跡としてのデジタル資産（以下「デジタルアセット」）を取得できるプラットフォームです。</p>
        </section>

        <section className="bg-white/5 p-5 rounded-xl border border-white/5">
          <h2 className="text-base font-bold text-white mb-3 italic border-l-2 border-pink-500 pl-3">第3条（決済、役務の完了および商品プラン）</h2>
          <ul className="list-decimal ml-5 space-y-2">
            <li>ユーザーは、本サービス上で定められた金額を支払うことにより、デジタルアセットおよび各種イベント入場券（以下、総称して「本商品」）を購入できます。</li>
            <li className="text-pink-400 font-bold">本サービスにおける役務の提供は、決済完了後、ユーザーにデジタルアセットの閲覧権、メッセージ送信権、または入場用QRコード等の権利が付与された時点をもって完了したものとみなします。</li>
            <li>本商品のラインナップ（スタンダード、メッセージ、エントランス、カスタム等）ごとに設定された個別規約や上限金額、およびエビデンス要件等は、購入画面またはイベントごとに提示される条件に準じるものとします。</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-3 italic border-l-2 border-indigo-500 pl-3">第4条（演出および付帯サービスの提供）</h2>
          <p className="mb-3">本デジタルアセットに伴う会場内での演出等について、サービス提供者は提供に向けて最大限努力しますが、不慮のトラブルや進行上の都合により提供できなかった場合、当社およびサービス提供者は責任を負わないものとします。</p>
          <p className="text-slate-400 italic">※デジタルアセットの引渡しは演出の実行状況に関わらず、決済完了をもって完了したものとみなします。</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-3 italic border-l-2 border-amber-500 pl-3">第5条（イベント不参加（ノーショー）に関する免責）</h2>
          <p className="mb-3">決済完了をもって、イベント等の入場権利の引渡しおよび会場枠の確保を完了したものとします。利用者の自己都合、交通機関の遅延、体調不良等により不参加（以下「ノーショー」）となった場合であっても、返金には一切応じられません。</p>
          <p className="text-slate-400 italic">※ノーショー時もデジタルアセットの閲覧権限は維持されますが、当日限定の演出を受ける権利は失効します。</p>
        </section>

        <section className="bg-pink-500/5 p-5 rounded-xl border border-pink-500/10">
          <h2 className="text-base font-bold text-pink-500 mb-3 italic border-l-2 border-pink-500 pl-3">第6条（返品・返金ポリシー）</h2>
          <ol className="list-decimal ml-5 space-y-3">
            <li className="font-bold text-white underline decoration-pink-500/30 underline-offset-4 text-sm">決済完了後におけるユーザー都合によるキャンセル、返品、返金には一切応じられません。</li>
            <li className="text-slate-400">前項にかかわらず、イベントの開催自体が中止となった場合の返金基準（返金手数料の有無、決済手段による可否等）は、主催者（オーガナイザー）が選択したプランの条件に準じるものとします。プラットフォーム（当社）は、主催者の都合や資金状況に起因する返金原資の保証、および主催者・ユーザー間の紛争について一切の責任を負いません。</li>
            <li className="text-slate-400">システム上の致命的な不具合により、DB格納およびブラウザ表示の「いずれも」行われなかった場合に限り、事実確認の上で個別に対応を行います。</li>
          </ol>
        </section>

        <section className="bg-slate-900 p-6 rounded-xl border border-slate-800">
      <div className="flex items-center gap-2 mb-4 text-pink-500">
        <AlertTriangle size={18} />
        <h2 className="text-base font-bold italic uppercase tracking-tight">第7条（免責事項）</h2>
      </div>
      <ul className="list-disc ml-5 space-y-4 text-slate-400">
        <li>
          <span className="text-white font-bold">【決済登録情報の優先と代替手段】</span><br />
          ユーザーが決済時に使用した情報の誤り（入力ミス、またはApple Pay等に登録済みの古いメールアドレス等）に起因する受領不能について、当社は<span className="text-slate-200">OS標準ウォレットへの格納やログイン後のコレクションページ表示等の代替手段を提供していることから</span>、デジタルアセットの再発行、調査、および返金の義務を一切負わないものとします。
        </li>
        <li>
          <span className="text-white font-bold">【不参加および演出リスク】</span><br />
          第4条（演出）および第5条（ノーショー）に起因する、入場不可や演出未実行に伴ういかなる損害（交通費・宿泊費等を含む）についても、当社およびサービス提供者は賠償責任を負わないものとします。
        </li>
      </ul>
    </section>

        <section>
          <h2 className="text-base font-bold text-white mb-3 italic border-l-2 border-slate-500 pl-3">第8条（禁止事項）</h2>
          <p className="mb-3">本サービスの運営妨害、他人の決済手段の不正使用、デジタルアセットの不正複製・改ざん、転売行為等を禁止します。</p>
          <p>また、メッセージ機能および応援メッセージを用いた、第三者への金銭要求、本サービスを介さない直接決済の勧誘、誹謗中傷その他法令または公序良俗に反する内容の送信を禁止します。</p>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-3 italic border-l-2 border-slate-500 pl-3">第9条（通信の秘密）</h2>
          <ol className="list-decimal ml-5 space-y-2">
            <li>当社は、電気通信事業法に基づく届出電気通信事業者（届出番号 A-08-24390）として、本サービスのメッセージ機能その他ユーザー間の通信の秘密を保護します。</li>
            <li>
              当社は、ユーザー間の通信の内容を閲覧・利用し、または第三者に提供しません。ただし、次の各号に該当する場合を除きます。
              <ol className="list-[lower-roman] ml-5 mt-2 space-y-1 text-slate-400">
                <li>裁判官の発する令状その他法令に基づき開示が求められた場合</li>
                <li>人の生命、身体または財産に対する差し迫った危険があり、緊急に必要と認められる場合</li>
                <li>システムの保守・障害対応に必要な範囲で、機械的に処理する場合</li>
              </ol>
            </li>
            <li>ユーザー間のトラブルについて当社へ相談・通報する場合、ユーザーは自らが当事者である通信の内容を、自らの判断で当社に提供するものとします。当社は、提供を受けた内容を当該トラブルへの対応に必要な範囲でのみ利用します。</li>
            <li>前各項は、次条に定める応援メッセージには適用しません。</li>
          </ol>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-3 italic border-l-2 border-slate-500 pl-3">第10条（応援メッセージの取扱い）</h2>
          <ol className="list-decimal ml-5 space-y-2">
            <li>Cheers（メッセージ）の購入に際して送信されるニックネームおよびメッセージ（以下「応援メッセージ」）は、宛先のアーティストに加え、当該イベントの主催者、担当エージェントおよび当社が閲覧できるものとし、会場での演出、SNSその他の媒体で公開されることがあります。</li>
            <li>ユーザーは、応援メッセージに個人情報その他他人に知られたくない情報を記載しないものとします。</li>
            <li>ユーザーは、当社、主催者およびアーティストに対し、応援メッセージを第1項の目的で無償で利用（公開・転載・編集を含む）することを許諾し、著作者人格権を行使しないものとします。</li>
          </ol>
        </section>

        <section>
          <h2 className="text-base font-bold text-white mb-3 italic border-l-2 border-slate-500 pl-3">第11条（規約の変更）</h2>
          <p>当社は、ユーザーの承諾を得ることなく、本規約を変更できるものとします。変更後の規約は、本サービス上に表示した時点から効力を生じるものとします。</p>
        </section>

      </div>
    </>
  );
}
