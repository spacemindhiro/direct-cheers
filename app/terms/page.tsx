import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, AlertTriangle, Mail, Zap } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      <div className="max-w-4xl mx-auto py-20 px-6">
        <div className="mb-12">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-pink-500 hover:text-white transition-colors uppercase tracking-widest group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> BACK TO HOME
          </Link>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-[3rem] p-8 md:p-16 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/5 blur-[100px] -z-10" />
          
          <div className="flex items-center gap-4 mb-8">
            <ShieldCheck className="text-pink-500" size={32} />
            <h1 className="text-3xl md:text-4xl font-black italic text-white uppercase tracking-tighter">利用規約</h1>
          </div>
          
          <p className="text-slate-500 text-sm mb-12 font-medium">最終改定日：2026年3月28日</p>
          
          <div className="space-y-12 text-slate-300 text-sm md:text-base leading-loose font-medium">
            
            <section>
              <h2 className="text-xl font-bold text-white mb-4 italic border-l-4 border-pink-500 pl-4">第1条（適用）</h2>
              <p>本規約は、Direct Cheers（以下「本サービス」）の利用条件を定めるものです。本サービスを利用する全てのユーザー（以下「ユーザー」）は、本規約に同意したものとみなされます。</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4 italic border-l-4 border-pink-500 pl-4">第2条（サービスの定義）</h2>
              <p>本サービスは、ライブイベントにおいてアーティストに対し「応援（Cheers!）」を贈ることで、リアルタイムの演出参加および、その証跡としてのデジタル証明書（以下「デジタルアセット」）を取得できるプラットフォームです。</p>
            </section>

            <section className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800">
              <h2 className="text-xl font-bold text-white mb-4 italic border-l-4 border-pink-500 pl-4">第3条（決済および役務の完了）</h2>
              <ul className="list-decimal ml-5 space-y-4">
                <li>ユーザーは、本サービス上で定められた金額を支払うことにより、デジタルアセットを購入できます。</li>
                <li>決済には、本サービスが指定する決済代行会社（Stripe）のシステムを利用するものとします。</li>
                <li className="text-white font-bold">
                  【情報の取得】 デジタルアセットの権利紐付けには、Stripe決済画面または決済手段（Apple Pay等）に登録済みのメールアドレスが自動適用されます。
                </li>
                <li className="text-pink-500 font-black italic underline decoration-pink-500/50">
                  本サービスにおける主たる役務の提供は、決済完了後、ユーザーのデバイス上にデジタルアセット（DB格納および表示）が正常に生成された時点をもって完了したものとみなします。
                </li>
              </ul>
            </section>

            {/* 🔥 新設：演出および付帯サービスの条項 */}
            <section className="bg-indigo-500/5 p-6 rounded-2xl border border-indigo-500/20 shadow-[0_0_30px_rgba(79,70,229,0.1)]">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="text-indigo-400" size={18} />
                <h2 className="text-xl font-bold text-white italic border-l-4 border-indigo-500 pl-4">第4条（演出および付帯サービスの提供）</h2>
              </div>
              <ul className="list-decimal ml-5 space-y-4">
                <li>
                  本デジタルアセットの購入に伴う会場内での演出および付帯サービス（以下「本件演出等」）について、サービス提供者（DJまたはイベント主催者）は、その提供に向けて商業的に合理的な範囲で最大限の努力を払うものとします。
                </li>
                <li className="text-indigo-300 font-bold">
                  前項の努力にもかかわらず、機器の故障、通信障害、進行上の都合、その他の不可抗力により本件演出等の全部または一部が提供できなかった場合、当社およびサービス提供者はその責任を負わないものとします。
                </li>
                <li className="bg-white/5 p-3 rounded-lg border border-white/10 italic text-[13px]">
                   本デジタルアセットの引渡し（DB格納および表示）は、会場内における本件演出等の実行状況に関わらず、決済完了をもって完了したものとみなします。演出の不履行を理由とした返金には応じられません。
                </li>
              </ul>
            </section>

            <section className="bg-pink-500/5 p-6 rounded-2xl border border-pink-500/20">
              <h2 className="text-xl font-bold text-pink-500 mb-4 italic border-l-4 border-pink-500 pl-4">第5条（返品・返金ポリシー）</h2>
              <p className="mb-4 text-white font-bold">商品の性質上（デジタルコンテンツおよびライブ演出連動）、決済完了後におけるユーザー都合によるキャンセル、返品、返金には一切応じられません。</p>
              <p>ただし、システム上の不具合によりデジタルアセットの発行（ブラウザ表示）が正常に行われなかった場合に限り、個別に対応を行うものとします。</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4 italic border-l-4 border-pink-500 pl-4">第6条（知的財産権）</h2>
              <p>本サービスを通じて提供される全てのコンテンツ（画像、シリアルナンバー、ロゴ等）の知的財産権は、当社または正当な権利を有する第三者に帰属します。</p>
            </section>

            <section className="border border-slate-800 p-8 rounded-3xl space-y-6 relative overflow-hidden bg-slate-900/30">
              <div className="absolute top-0 left-0 w-1 h-full bg-pink-500" />
              <div className="flex items-center gap-3 text-pink-500 mb-2">
                <AlertTriangle size={20} />
                <h2 className="text-xl font-bold italic uppercase">第7条（免責事項）</h2>
              </div>
              <ul className="list-decimal ml-5 space-y-5">
                <li>
                  <span className="text-white font-bold underline decoration-slate-700">【決済登録情報の優先】</span> 
                  ユーザーが決済時に使用したメールアドレスの不正確な情報に起因するトラブルについて、当社は一切の責任を負いません。
                </li>
                <li>
                  <span className="text-white font-bold underline decoration-slate-700">【演出の不確実性】</span> 
                  第4条に定める通り、会場内演出はベストエフォートでの提供であり、通信不良や機材トラブル等による演出の未実行について、当社およびサービス提供者は一切の損害賠償義務を負わないものとします。
                </li>
                <li>
                   当社は、通信環境の障害、ライブイベントの中断、各社ウォレットアプリの仕様変更等により、本サービスの提供が遅延または不能となった場合でも、一切の責任を負わないものとします。
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4 italic border-l-4 border-pink-500 pl-4">第8条（禁止事項）</h2>
              <p>ユーザーは、本サービスの運営を妨害する行為、他人の決済手段の不正使用、デジタルアセットの不正複製等を行ってはなりません。</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4 italic border-l-4 border-pink-500 pl-4">第9条（規約の変更）</h2>
              <p>当社は、ユーザーの承諾を得ることなく、本規約を変更できるものとします。</p>
            </section>

          </div>

          <div className="mt-20 pt-12 border-t border-slate-800 flex flex-col items-center gap-6">
            <div className="flex items-center gap-2 text-slate-500 group">
              <Mail size={14} />
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase transition-colors group-hover:text-pink-500">support@direct-cheers.com</span>
            </div>
            <div className="text-slate-600 text-[10px] font-mono italic">
              © 2026 Direct Cheers Platform. All Rights Reserved.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}