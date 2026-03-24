import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function LawPage() {
  const lawData = [
    { label: "販売業者", value: "SpaceMind Direct Cheers 事務局（代表：森脇 弘貴）" },
    { label: "代表責任者", value: "森脇 弘貴" },
    { label: "所在地", value: "〒223-0062 神奈川県横浜市港北区日吉本町x-x-x" },
    { label: "電話番号", value: "090-xxxx-xxxx" },
    { label: "メールアドレス", value: "spacemind.hiro@direct-cheers.com" },
    { label: "販売価格", value: "各商品の購入ページに表示される価格（税込）" },
    { label: "商品代金以外の必要料金", value: "なし（インターネット接続費用は別途お客様負担）" },
    { label: "支払方法", value: "クレジットカード決済、PayPay決済、Link決済" },
    { label: "商品の引渡時期", value: "決済完了後、直ちにブラウザ上のマイページにて閲覧可能な状態になります。" },
    { label: "返品・交換・キャンセル", value: "デジタルコンテンツの特性上、決済完了後の返品・返金・キャンセルには応じられません。" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      {/* --- Navigation --- */}
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
        {/* --- Header --- */}
        <section className="mb-16 text-center">
          <div className="inline-block p-3 bg-pink-500/10 rounded-2xl mb-6">
            <ShieldCheck className="text-pink-500" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tighter italic uppercase">
            特定商取引法に基づく表記
          </h1>
          <p className="text-slate-500 text-sm font-medium">
            Specified Commercial Transactions Act
          </p>
        </section>

        {/* --- Law Table --- */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
          <dl className="divide-y divide-slate-800">
            {lawData.map((item, index) => (
              <div key={index} className="flex flex-col md:flex-row p-8 md:items-center gap-4 hover:bg-slate-900/60 transition-colors">
                <dt className="md:w-1/3 text-[10px] font-bold uppercase tracking-[0.2em] text-pink-500/80">
                  {item.label}
                </dt>
                <dd className="md:w-2/3 text-sm md:text-base text-slate-200 font-medium leading-relaxed">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* --- Notice --- */}
        <footer className="mt-16 pt-10 border-t border-slate-900">
          <p className="text-slate-600 text-[10px] text-center font-mono italic leading-relaxed">
            お客様の個人情報は、当プラットフォームのプライバシーポリシーに従い、<br />
            厳重に管理・保護されます。
          </p>
        </footer>
      </main>
    </div>
  );
}