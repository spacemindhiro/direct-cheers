'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft } from 'lucide-react';
import { TERMS_LABELS, type TermsType } from '@/lib/terms';
import { TermsText } from '@/components/terms-text';

type Agreement = {
  terms_type: TermsType;
  version: string;
  agreed_at: string;
  confirmed_at: string | null;
};

// デジタル同意した規約を、同意したバージョンの本文で見返すためのページ。
// 本人の同意記録が無い種別・バージョンはプロフィールへ戻す。
export function AgreementClient({ type, version }: { type: string; version: string }) {
  const router = useRouter();
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/terms/agreements')
      .then((r) => {
        if (r.status === 401) { router.push('/auth/login'); return null; }
        if (!r.ok) { router.push('/dashboard/profile'); return null; }
        return r.json();
      })
      .then((data: { agreements: Agreement[] } | null) => {
        if (!data) return;
        const found = data.agreements.find((a) => a.terms_type === type && a.version === version);
        if (!found) { router.push('/dashboard/profile'); return; }
        setAgreement(found);
      })
      .finally(() => setLoading(false));
  }, [type, version, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    );
  }

  if (!agreement) return null;

  const agreedAt = new Date(agreement.agreed_at);
  const dateLabel = agreedAt.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Tokyo',
  });
  const timeLabel = agreedAt.toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  });

  return (
    <div className="space-y-8 pb-16">

      {/* 戻るボタン */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/profile"
          className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">My Agreement</p>
          <h1 className="text-xl font-black text-white">同意済みの規約</h1>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] px-6 py-8 space-y-10">

        {/* 同意情報 */}
        <dl className="space-y-3 pb-8 border-b border-slate-800">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">規約種別</dt>
            <dd className="text-sm text-slate-300 text-right">{TERMS_LABELS[agreement.terms_type] ?? agreement.terms_type}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">バージョン</dt>
            <dd className="text-sm text-slate-300 text-right">{agreement.version}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">同意日時</dt>
            <dd className="text-sm text-slate-300 text-right">{dateLabel}　{timeLabel}</dd>
          </div>
        </dl>

        {/* 規約全文（同意したバージョン） */}
        <TermsText types={[agreement.terms_type]} versions={{ [agreement.terms_type]: agreement.version }} />

      </div>
    </div>
  );
}
