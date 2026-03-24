import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, ShieldCheck, EyeOff } from "lucide-react";

export default function PrivacyPage() {
  const sections = [
    {
      title: "1. 取得する個人情報の項目",
      content: "当事務局は、本サービスにおいて以下の情報を取得します。\n・アカウント情報（氏名、メールアドレス、SNS連携情報）\n・決済関連情報（クレジットカード情報の下4桁、決済履歴 ※決済の詳細はStripe社が保持します）\n・技術的情報（IPアドレス、ブラウザ情報、Cookie、ウォレットアドレス、デバイス識別子）"
    },
    {
      title: "2. 利用目的の明示",
      content: "取得した情報は、以下の目的のみに利用します。\n・デジタルアセット（Cheers!カード）の発行、管理および所有権の証明\n・応援アクションに伴うリアルタイム演出の実行\n・アーティストからの重要なお知らせ、特典配布、およびプッシュ通知の配信\n・本サービスの改善、不正利用の防止、およびカスタマーサポート"
    },
    {
      title: "3. 第三者提供と共同利用",
      content: "当事務局は、イベントの興行主または出演アーティストに対し、演出の実行および特典提供に必要な範囲内で、統計的なデータまたは個別の識別情報（ウォレットアドレス等）を提供することがあります。法令に基づく場合を除き、これら以外の第三者に無断で個人データを開示することはありません。"
    },
    {
      title: "4. データの安全管理と保存期間",
      content: "お客様のデータは最新の暗号化技術を用いて保護されます。決済情報は国際基準（PCI DSS）に準拠したStripe社のインフラを利用し、当事務局側ではカード情報を直接保持しません。また、退会等により利用目的が消滅した情報は、法令の定める保存期間を経て速やかに破棄します。"
    },
    {
      title: "5. Cookieおよび解析ツールの利用",
      content: "利便性向上および利用状況把握のため、CookieおよびGoogle Analytics等の解析ツールを使用することがあります。これらは匿名で収集され、個人を特定するものではありません。"
    },
    {
      title: "6. お問い合わせ・開示請求",
      content: "個人情報の開示、訂正、利用停止のご要望は、特商法ページに記載のメールアドレスまでご連絡ください。本人確認の上、合理的な範囲で速やかに対応いたします。"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      <nav className="p-6 border-b border-slate-800 sticky top-0 bg-slate-950/80 backdrop-blur-md z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold hover:text-pink-500 transition-colors group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> BACK TO TOP
          </Link>
          <div className="text-[10px] font-black italic text-slate-500 uppercase tracking-widest">Privacy Policy</div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto py-20 px-6">
        <section className="mb-16 text-center">
          <div className="inline-block p-4 bg-gradient-to-br from-violet-500/20 to-pink-500/20 rounded-3xl mb-6 border border-violet-500/20">
            <Lock className="text-violet-500" size={40} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tighter italic uppercase">
            プライバシーポリシー
          </h1>
          <p className="text-slate-500 text-sm font-medium italic">Data Protection & User Privacy</p>
        </section>

        <div className="grid gap-6">
          {sections.map((section, index) => (
            <div key={index} className="bg-slate-900/40 p-10 rounded-[2.5rem] border border-slate-800 hover:border-slate-700 transition-colors">
              <h2 className="text-pink-500 font-bold text-lg mb-6 italic flex items-center gap-3">
                <span className="w-1.5 h-1.5 bg-pink-500 rounded-full" />
                {section.title}
              </h2>
              <p className="text-slate-400 leading-relaxed text-sm md:text-base whitespace-pre-wrap">
                {section.content}
              </p>
            </div>
          ))}
        </div>

        <footer className="mt-20 pt-10 border-t border-slate-900 text-center">
          <p className="text-slate-600 text-[10px] font-mono italic">
            Last Updated: 2026.03.24
          </p>
        </footer>
      </main>
    </div>
  );
}