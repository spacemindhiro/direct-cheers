import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, AlertTriangle, Mail } from "lucide-react";

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
                  【情報の取得】 デジタルアセットの権利紐付けおよび通知には、Stripeの決済画面で入力されたメールアドレス、または決済手段（Apple Pay / Google Pay等）に登録済みのメールアドレスが自動的に適用されます。
                </li>
                <li className="text-pink-500 font-black italic underline decoration-pink-500/50">
                  本サービスにおける役務の提供は、決済完了後、ユーザーのブラウザ上にデジタルアセットが正常に表示された時点をもって完了するものとします。
                </li>
              </ul>
            </section>

            <section className="bg-pink-500/5 p-6 rounded-2xl border border-pink-500/20">
              <h2 className="text-xl font-bold text-pink-500 mb-4 italic border-l-4 border-pink-500 pl-4">第4条（返品・返金ポリシー）</h2>
              <p className="mb-4 text-white font-bold">商品の性質上（デジタルコンテンツおよびライブ演出連動）、決済完了後におけるユーザー都合によるキャンセル、返品、返金には一切応じられません。</p>
              <p>ただし、システム上の不具合によりデジタルアセットの発行（ブラウザ表示）が正常に行われなかった場合に限り、個別に対応を行うものとします。</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4 italic border-l-4 border-pink-500 pl-4">第5条（知的財産権）</h2>
              <p>本サービスを通じて提供される全てのコンテンツ（画像、シリアルナンバー、ロゴ等）の知的財産権は、当社または正当な権利を有する第三者に帰属します。ユーザーは、これらを私的な利用範囲を超えて、無断で複製、転載、転売することはできません。</p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4 italic border-l-4 border-pink-500 pl-4">第6条（禁止事項）</h2>
              <p>ユーザーは、以下の行為を行ってはなりません。</p>
              <ul className="list-disc ml-5 space-y-2 mt-2">
                <li>本サービスの運営を妨害する行為</li>
                <li>他人の決済手段を不正に使用する行為</li>
                <li>デジタルアセットの不正な複製、改ざん</li>
                <li>公序良俗に反する行為、またはそれに類する行為</li>
              </ul>
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
                  ユーザーが決済時に使用したメールアドレスの誤入力、または決済アプリ（Apple Pay等）に登録されている古い情報や不正確な情報に起因する、デジタルアセットの受領不能、紛失、第三者への誤送信等について、当社は一切の責任を負わず、再発行や調査、返金の義務を負わないものとします。
                </li>
                <li>
                  <span className="text-white font-bold underline decoration-slate-700">【コレクション・保存の自己責任】</span> 
                  第3条に定める役務完了後の、OS標準ウォレット（Apple Wallet / Google Wallet）への追加操作、および保存状態の維持はユーザーの自己責任において行われるものとし、当社はこれに起因する紛失や表示の不具合について保証しません。
                </li>
                <li>
                  当社は、通信環境の障害、ライブイベントの中断、各社ウォレットアプリの仕様変更等により、本サービスの提供が遅延または不能となった場合でも、一切の責任を負わないものとします。
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-white mb-4 italic border-l-4 border-pink-500 pl-4">第8条（規約の変更）</h2>
              <p>当社は、ユーザーの承諾を得ることなく、本規約を変更できるものとします。変更後の規約は、本サービス上に表示した時点から効力を生じるものとします。</p>
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