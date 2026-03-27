'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function LawPage() {
  // ✅ 確定した手数料体系（13.6%）と商品を反映
  const lawData = [
    { label: "販売業者", value: "SpaceMind Direct Cheers 事務局（代表：森脇 弘貴）" },
    { label: "代表責任者", value: "森脇 弘貴" },
    { label: "所在地", value: "〒223-0062 神奈川県横浜市港北区日吉本町x-x-x" }, // 確定したらここを埋める
    { label: "電話番号", value: "050-xxxx-xxxx" }, // 取得した050番号をここに
    { label: "メールアドレス", value: "support@direct-cheers.com" }, // お名前メールをここに
    { label: "販売価格", value: "各アーティスト・応援プロジェクトごとに表示（税込）" },
    { 
      label: "商品代金以外の必要料金", 
      value: "システム利用料 10% および 決済手数料 3.6%（合計 13.6%）が、応援金額に含まれる、もしくは別途加算されます。詳細は各決済画面にて表示します。また、インターネット接続費用はお客様負担となります。" 
    },
    { label: "支払方法", value: "クレジットカード決済（Stripe）、Google Pay、Apple Pay、PayPay" },
    { 
      label: "商品の引渡時期", 
      value: "決済完了後、直ちにデジタル応援証明書を発行します。ブラウザ上のマイページにて閲覧可能なほか、Apple Wallet / Google Walletへの格納が可能です。" 
    },
    { label: "返品・交換・キャンセル", value: "デジタルコンテンツおよびサービスの性質上、決済完了後の返品・返金・キャンセルには応じられません。" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      <nav className="p-6 border-b border-slate-800 backdrop-blur-md bg-slate-950/80 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold hover:text-pink-500 transition-colors group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> BACK TO TOP
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-black italic tracking-tighter text-slate-500 uppercase">
            Legal Compliance
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto py-20 px-6">
        <section className="mb-16 text-center">
          <div className="inline-block p-3 bg-pink-500/10 rounded-2xl mb-6">
            <ShieldCheck className="text-pink-500" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tighter italic uppercase">
            特定商取引法に基づく表記
          </h1>
          <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">
            Specified Commercial Transactions Act
          </p>
        </section>

        <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl backdrop-blur-sm">
          <dl className="divide-y divide-slate-800">
            {lawData.map((item, index) => (
              <div key={index} className="flex flex-col md:flex-row p-8 md:items-start gap-4 hover:bg-slate-900/60 transition-colors">
                <dt className="md:w-1/3 text-[10px] font-bold uppercase tracking-[0.2em] text-pink-500/80 pt-1">
                  {item.label}
                </dt>
                <dd className="md:w-2/3 text-sm md:text-base text-slate-200 font-medium leading-relaxed">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <footer className="mt-16 pt-10 border-t border-slate-900">
          <p className="text-slate-600 text-[10px] text-center font-mono italic leading-relaxed">
            本プラットフォームは、アーティストとファンの直接的な支援を目的とした<br />
            デジタル応援証明書発行サービスです。
          </p>
        </footer>
      </main>
    </div>
  );
}