'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, MonitorSmartphone, CreditCard } from "lucide-react";

export default function LawPage() {
  // ✅ 確定した手数料体系、動作環境、支払時期を網羅
  const lawData = [
    { 
      label: "販売業者", 
      value: "SpaceMind Direct Cheers 事務局（代表：森脇 弘貴）" 
    },
    { 
      label: "代表責任者", 
      value: "森脇 弘貴" 
    },
    { 
      label: "所在地", 
      value: "〒223-0062 神奈川県横浜市港北区日吉本町x-x-x" // 👈 Stripe登録住所と完全一致させること
    },
    { 
      label: "電話番号", 
      value: "050-xxxx-xxxx" // 👈 取得した050番号
    },
    { 
      label: "メールアドレス", 
      value: "support@direct-cheers.com" 
    },
    { 
      label: "販売価格", 
      value: "各アーティスト・応援プロジェクトごとに表示（消費税込み）" 
    },
    { 
      label: "商品代金以外の必要料金", 
      value: "システム利用料 10% および 決済手数料 3.6%（合計 13.6%）が価格に含まれます。また、本サービスの利用、コンテンツのダウンロード等に必要なインターネット接続費用および通信料はお客様の負担となります。" 
    },
    { 
      label: "支払方法", 
      value: "クレジットカード決済（Visa, Mastercard, American Express, JCB）、Google Pay、Apple Pay" 
    },
    { 
      label: "支払時期", 
      value: "クレジットカード等の決済承認が下りた時点で、お支払いが確定いたします。" 
    },
    { 
      label: "商品の引渡時期", 
      value: "決済完了後、直ちにデジタル応援証明書（デジタルアセット）をブラウザ上に発行・表示いたします。" 
    },
    { 
      label: "動作環境", 
      value: "iOS: Safari 最新版 / Android: Google Chrome 最新版。Apple Wallet または Google Wallet への追加機能は、各OSの標準搭載アプリおよび仕様に準じます。" 
    },
    { 
      label: "返品・交換・キャンセル", 
      value: "デジタルコンテンツおよびライブ演出連動サービスの性質上、決済完了後におけるユーザー都合によるキャンセル、返品、返金には一切応じられません。" 
    },
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

        <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl backdrop-blur-sm relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/5 blur-3xl -z-10" />
          
          <dl className="divide-y divide-slate-800">
            {lawData.map((item, index) => (
              <div key={index} className="flex flex-col md:flex-row p-8 md:items-start gap-4 hover:bg-slate-900/60 transition-colors group">
                <dt className="md:w-1/3 text-[10px] font-black uppercase tracking-[0.2em] text-pink-500/80 pt-1 flex items-center gap-2">
                  {item.label === "支払方法" && <CreditCard size={12} />}
                  {item.label === "動作環境" && <MonitorSmartphone size={12} />}
                  {item.label}
                </dt>
                <dd className="md:w-2/3 text-sm md:text-base text-slate-200 font-medium leading-relaxed">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <footer className="mt-16 pt-10 border-t border-slate-900 text-center">
          <p className="text-slate-600 text-[11px] font-mono italic leading-relaxed mb-4">
            本プラットフォームは、SpaceMind Direct Cheers 事務局が運営し、<br />
            アーティストへの直接支援を技術的に担保するデジタルアセット発行サービスです。
          </p>
          <div className="text-[10px] text-slate-700 font-bold tracking-widest uppercase">
            Platform ver 1.0.4 - 2026 Edition
          </div>
        </footer>
      </main>
    </div>
  );
}