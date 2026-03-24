import React from 'react';
import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8 md:p-24 font-sans leading-relaxed">
      <div className="max-w-3xl mx-auto text-sm space-y-8">
        <Link href="/" className="text-pink-500 font-bold hover:underline inline-block">← HOME</Link>
        <h1 className="text-3xl font-black italic border-l-4 border-pink-500 pl-4 uppercase">利用規約 (Beta)</h1>
        <p className="text-slate-500">本規約は、Direct Cheersの利用条件を定めるものです。</p>
        
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white">第1条（デジタルアセットの購入）</h2>
          <p className="text-slate-400">ユーザーは、本サービスを通じて、ライブイベントの演出参加および記念デジタルコンテンツ（NFTを含む）を購入することができます。</p>
        </section>

        <section className="space-y-4 text-slate-600 italic">
          <p>※現在、規約の全文を作成中です。Stripe審査申請までに正式版に差し替えます。</p>
        </section>
      </div>
    </div>
  );
}