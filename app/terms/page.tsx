import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, AlertTriangle, Mail } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans selection:bg-pink-500/30">
      <div className="max-w-4xl mx-auto py-20 px-6">
        <div className="mb-12">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-pink-500 hover:text-white transition-colors uppercase tracking-widest group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> BACK TO HOME
          </Link>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-[2rem] p-8 md:p-12 shadow-2xl relative">
          
          <div className="flex items-center gap-4 mb-12 border-b border-slate-800 pb-8">
            <ShieldCheck className="text-pink-500" size={28} />
            <h1 className="text-2xl md:text-3xl font-black italic text-white uppercase tracking-tight">利用規約</h1>
            <span className="ml-auto text-[10px] text-slate-500 font-mono italic text-right">Last Updated: 2026.04.03</span>
          </div>
          
          <div className="space-y-10 text-[13px] md:text-sm leading-relaxed">
            
            <section>
              <h2 className="text-base font-bold text-white mb-3 italic border-l-2 border-pink-500 pl-3">第1条（適用）</h2>
              <p>本規約は、Direct Cheers（以下「本サービス」）の利用条件を定めるものです。本サービスを利用する全てのユーザーは、本規約に同意したものとみなされます。</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white mb-3 italic border-l-2 border-pink-500 pl-3">第2条（サービスの定義）</h2>
              <p>本サービスは、ライブイベントにおいてアーティストに対し応援（Cheers!）を贈ることで、リアルタイムの演出参加および、その証跡としてのデジタル資産（以下「デジタルアセット」）を取得できるプラットフォームです。</p>
            </section>

            <section className="bg-white/5 p-5 rounded-xl border border-white/5">
              <h2 className="text-base font-bold text-white mb-3 italic border-l-2 border-pink-500 pl-3">第3条（決済および役務の完了）</h2>
              <ul className="list-decimal ml-5 space-y-2">
                <li>ユーザーは、本サービス上で定められた金額を支払うことにより、デジタルアセットを購入できます。</li>
                <li className="text-pink-400 font-bold">本サービスにおける役務の提供は、決済完了後、ユーザーのデバイス上にデジタルアセット（DB格納または表示のいずれか）が正常に実行された時点をもって完了したものとみなします。</li>
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
              <p className="font-bold text-white mb-2 underline decoration-pink-500/30 underline-offset-4 text-sm">決済完了後におけるユーザー都合によるキャンセル、返品、返金には一切応じられません。</p>
              <p className="text-slate-400">システム上の致命的な不具合により、DB格納およびブラウザ表示の「いずれも」行われなかった場合に限り、事実確認の上で個別に対応を行います。</p>
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
              <p>本サービスの運営妨害、他人の決済手段の不正使用、デジタルアセットの不正複製・改ざん、転売行為等を禁止します。</p>
            </section>

            <section>
              <h2 className="text-base font-bold text-white mb-3 italic border-l-2 border-slate-500 pl-3">第9条（規約の変更）</h2>
              <p>当社は、ユーザーの承諾を得ることなく、本規約を変更できるものとします。変更後の規約は、本サービス上に表示した時点から効力を生じるものとします。</p>
            </section>

          </div>

          <div className="mt-20 pt-10 border-t border-slate-800 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-slate-500 group cursor-pointer">
              <Mail size={14} />
              <span className="text-[10px] font-bold tracking-widest uppercase group-hover:text-pink-500 transition-colors">support@direct-cheers.com</span>
            </div>
            <div className="text-slate-600 text-[9px] font-mono italic">
              © 2026 Direct Cheers Platform. All Rights Reserved.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}