import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, AlertTriangle, Mail, Zap, UserX } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      <div className="max-w-4xl mx-auto py-20 px-6">
        <div className="mb-12">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-pink-500 hover:text-white transition-colors uppercase tracking-widest group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> BACK TO HOME
          </Link>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-[3rem] p-8 md:p-16 shadow-2xl relative overflow-hidden text-[13px] md:text-sm">
          <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/5 blur-[100px] -z-10" />
          
          <div className="flex items-center gap-4 mb-8">
            <ShieldCheck className="text-pink-500" size={32} />
            <h1 className="text-3xl md:text-4xl font-black italic text-white uppercase tracking-tighter">利用規約</h1>
          </div>
          
          <p className="text-slate-500 text-[10px] mb-12 font-bold uppercase tracking-[0.2em]">Last Updated: 2026.03.28</p>
          
          <div className="space-y-12 text-slate-300 leading-loose font-medium">
            
            <section>
              <h2 className="text-lg font-bold text-white mb-4 italic border-l-4 border-pink-500 pl-4">第1条（適用）</h2>
              <p>本規約は、Direct Cheers（以下「本サービス」）の利用条件を定めるものです。本サービスを利用する全てのユーザー（以下「ユーザー」）は、本規約に同意したものとみなされます。</p>
            </section>

            <section className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800">
              <h2 className="text-lg font-bold text-white mb-4 italic border-l-4 border-pink-500 pl-4">第3条（決済および役務の完了）</h2>
              <ul className="list-decimal ml-5 space-y-4">
                <li className="text-pink-500 font-black italic underline decoration-pink-500/50">
                  本サービスにおける主たる役務の提供は、決済完了後、ユーザーのデバイス上にデジタルアセット（DB格納または表示のいずれか）が正常に実行された時点をもって完了したものとみなします。
                </li>
              </ul>
            </section>

            <section className="bg-indigo-500/5 p-6 rounded-2xl border border-indigo-500/20">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="text-indigo-400" size={18} />
                <h2 className="text-lg font-bold text-white italic border-l-4 border-indigo-500 pl-4 uppercase">第4条（演出および付帯サービスの提供）</h2>
              </div>
              <p>本件演出等の全部または一部が提供できなかった場合、当社およびサービス提供者はその責任を負わないものとします。演出の不履行を理由とした返金には応じられません。</p>
            </section>

            {/* 🔥 新設：ノーショー免責条項 */}
            <section className="bg-amber-500/5 p-6 rounded-2xl border border-amber-500/20 shadow-[0_0_30px_rgba(245,158,11,0.05)]">
              <div className="flex items-center gap-2 mb-4">
                <UserX className="text-amber-500" size={18} />
                <h2 className="text-lg font-bold text-white italic border-l-4 border-amber-500 pl-4 uppercase">第5条（イベント不参加（ノーショー）に関する免責）</h2>
              </div>
              <ul className="list-decimal ml-5 space-y-4">
                <li>
                  本デジタル資産にイベント等への入場権利が含まれる場合、決済完了をもって当該権利の引渡しおよび会場枠の確保を完了したものとします。
                </li>
                <li className="text-amber-200 font-bold">
                  利用者の自己都合、交通機関の遅延、体調不良、その他の事由によりイベントに参加できなかった場合（以下「ノーショー」）であっても、既に引渡し済みのデジタル資産の返品、および決済代金の返金には一切応じられません。
                </li>
                <li className="bg-white/5 p-3 rounded-lg border border-white/10 italic text-[12px] text-slate-400">
                   ノーショーが発生した場合でも、付随するデジタル資産（サンクスカード等）の閲覧権限は維持されますが、イベント当日に限定された付帯演出等の提供を受ける権利は失効するものとします。
                </li>
              </ul>
            </section>

            <section className="bg-pink-500/5 p-6 rounded-2xl border border-pink-500/20">
              <h2 className="text-lg font-bold text-pink-500 mb-4 italic border-l-4 border-pink-500 pl-4 uppercase">第6条（返品・返金ポリシー）</h2>
              <p className="mb-4 text-white font-bold">決済完了後におけるユーザー都合によるキャンセル、返品、返金には一切応じられません。</p>
              <div className="bg-slate-900/50 p-4 rounded-xl border border-pink-500/10 italic text-slate-400 text-[12px]">
                ただし、システム上の致命的な不具合により、デジタルアセットのDBへの正常な格納、およびブラウザ表示の「いずれも」行われなかった場合に限り、事実確認の上で個別に対応を行うものとします。
              </div>
            </section>

            <section className="border border-slate-800 p-8 rounded-3xl space-y-6 relative overflow-hidden bg-slate-900/30">
              <div className="absolute top-0 left-0 w-1 h-full bg-pink-500" />
              <div className="flex items-center gap-3 text-pink-500 mb-2">
                <AlertTriangle size={20} />
                <h2 className="text-lg font-bold italic uppercase">第7条（免責事項）</h2>
              </div>
              <ul className="list-decimal ml-5 space-y-5">
                <li>
                  <span className="text-white font-bold underline decoration-slate-700">【決済登録情報の優先】</span> 
                  誤入力や古い情報に起因する受領不能について、当社は再発行や返金の義務を負わないものとします。
                </li>
                <li>
                  <span className="text-white font-bold underline decoration-slate-700">【不参加リスク】</span> 
                  第5条に定めるノーショーについて、当社およびサービス提供者は、入場不可に伴ういかなる損害（交通費・宿泊費等を含む）についても賠償責任を負わないものとします。
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-white mb-4 italic border-l-4 border-pink-500 pl-4 uppercase">第8条（禁止事項）</h2>
              <p>ユーザーは、本サービスの運営を妨害する行為、デジタルアセットの不正複製等を行ってはなりません。</p>
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