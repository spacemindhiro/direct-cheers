import Link from 'next/link';
import { ArrowLeft, Mail } from "lucide-react";
import { TermsDocument } from "@/components/legal/terms-document";
import { TermsHistory } from "@/components/legal/terms-history";
import { TermsVersionNotice } from "@/components/legal/terms-version-notice";

// 公開の利用規約ページ。version 指定で過去の版を表示する（/terms/[version] から使う）
export function PublicTermsView({ version }: { version?: string }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans selection:bg-pink-500/30">
      <div className="max-w-4xl mx-auto py-20 px-6">
        <div className="mb-12">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-pink-500 hover:text-white transition-colors uppercase tracking-widest group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> BACK TO HOME
          </Link>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-[2rem] p-8 md:p-12 shadow-2xl relative">
          {version && <div className="mb-8"><TermsVersionNotice version={version} currentHref="/terms" /></div>}

          <TermsDocument version={version} />

          <div className="mt-16 pt-10 border-t border-slate-800">
            <TermsHistory hrefBase="/terms" current={version} />
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
