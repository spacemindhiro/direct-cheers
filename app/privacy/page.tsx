import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock } from "lucide-react";

export default function PrivacyPage() {
  const sections = [
    {
      title: "1. 取得する個人情報",
      content: "当事務局は、本サービスの提供にあたり、メールアドレス、氏名（ニックネームを含む）、決済情報、およびウォレットアドレス等の情報を取得します。"
    },
    {
      title: "2. 利用目的",
      content: "取得した情報は、本人確認、決済処理、デジタルアセット（NFT等）の送付、アーティストからの通知配信、およびお問い合わせ対応のために利用します。"
    },
    {
      title: "3. 第三者への提供",
      content: "お客様の同意がある場合、または法令に基づく場合を除き、取得した個人情報を第三者に提供することはありません。ただし、イベント演出や特典送付のため、必要最低限の範囲でアーティストまたは興行主と共有する場合があります。"
    },
    {
      title: "4. 安全管理措置",
      content: "当事務局は、個人情報の漏洩、滅失または毀損の防止その他の個人情報の安全管理のために必要かつ適切な措置を講じます。"
    },
    {
      title: "5. お問い合わせ窓口",
      content: "個人情報の取り扱いに関するお問い合わせは、特商法ページに記載のメールアドレスまでご連絡ください。"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      <nav className="p-6 border-b border-slate-800 sticky top-0 bg-slate-950/80 backdrop-blur-md z-50">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 text-sm font-bold hover:text-pink-500 transition-colors group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> BACK TO TOP
          </Link>
          <div className="text-[10px] font-black italic text-slate-500 uppercase">Privacy Policy</div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto py-20 px-6">
        <section className="mb-16 text-center">
          <div className="inline-block p-3 bg-violet-500/10 rounded-2xl mb-6">
            <Lock className="text-violet-500" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tighter italic uppercase">
            プライバシーポリシー
          </h1>
        </section>

        <div className="space-y-12">
          {sections.map((section, index) => (
            <div key={index} className="bg-slate-900/40 p-8 rounded-[2rem] border border-slate-800">
              <h2 className="text-pink-500 font-bold text-lg mb-4 italic">{section.title}</h2>
              <p className="text-slate-400 leading-relaxed text-sm md:text-base whitespace-pre-wrap">
                {section.content}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}