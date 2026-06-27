'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft } from 'lucide-react';
import { TERMS_LABELS, TERMS_CONTENT, type TermsType } from '@/lib/terms';

type DocData = {
  id: string;
  signed_at: string;
  terms_types: TermsType[];
  terms_version: string;
  admin_signature_url: string | null;
  subject_signature_url: string | null;
  signed_by_name: string | null;
};

function TermsText({ types }: { types: TermsType[] }) {
  return (
    <div className="space-y-12">
      {types.map((t) => (
        <div key={t} className="space-y-6">
          <p className="text-base font-black text-indigo-400 uppercase tracking-[0.3em]">
            {TERMS_LABELS[t]}
          </p>
          {TERMS_CONTENT[t].map((section) => (
            <div key={section.article} className="space-y-2">
              <p className="text-base font-black text-white">
                {section.article}　{section.title}
              </p>
              <div className="space-y-2">
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-base text-slate-400 leading-relaxed">
                    {section.paragraphs.length > 1 ? `${i + 1}．` : ''}{p}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function DocumentClient({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [doc, setDoc] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/documents/${documentId}`)
      .then((r) => {
        if (r.status === 401) { router.push('/auth/login'); return null; }
        if (!r.ok) { router.push('/dashboard/profile'); return null; }
        return r.json();
      })
      .then((data) => { if (data) setDoc(data); })
      .finally(() => setLoading(false));
  }, [documentId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    );
  }

  if (!doc) return null;

  const signedAt = new Date(doc.signed_at);
  const dateLabel = signedAt.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Tokyo',
  });
  const timeLabel = signedAt.toLocaleTimeString('ja-JP', {
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
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">My Document</p>
          <h1 className="text-xl font-black text-white">利用規約同意書</h1>
        </div>
      </div>

      {/* 書面本体 */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] px-6 py-8 space-y-10">

        {/* タイトル */}
        <div className="text-center space-y-3 pb-8 border-b border-slate-800">
          <p className="text-sm font-black text-slate-500 uppercase tracking-[0.4em]">Direct Cheers</p>
          <h2 className="text-3xl font-black text-white">利用規約 同意書</h2>
          <p className="text-base text-slate-500">{dateLabel}　{timeLabel}</p>
        </div>

        {/* 文書情報 */}
        <dl className="space-y-3 pb-8 border-b border-slate-800">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">調印日時</dt>
            <dd className="text-sm text-slate-300 text-right">{dateLabel}　{timeLabel}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">確認者</dt>
            <dd className="text-sm text-slate-300 text-right">{doc.signed_by_name ?? '—'}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0 mt-0.5">規約種別</dt>
            <dd className="flex flex-wrap gap-1.5 justify-end">
              {doc.terms_types.map((t) => (
                <span key={t} className="text-[9px] font-black px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 uppercase tracking-wider">
                  {TERMS_LABELS[t] ?? t}
                </span>
              ))}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">バージョン</dt>
            <dd className="text-sm text-slate-300 text-right">{doc.terms_version}</dd>
          </div>
        </dl>

        {/* 規約全文 */}
        <TermsText types={doc.terms_types} />

        {/* 署名 */}
        <div className="space-y-6 pt-4 border-t border-slate-800">
          <p className="text-sm font-black text-slate-500 uppercase tracking-[0.4em] text-center">Signatures</p>

          <div className="border border-slate-700 rounded-[1.5rem] p-6 space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">あなたのサイン</p>
            <p className="text-sm text-slate-400">上記の利用規約を熟読し、全条項に同意します。</p>
            {doc.subject_signature_url ? (
              <img
                src={doc.subject_signature_url}
                alt="署名者のサイン"
                className="w-full h-48 object-contain bg-slate-950 rounded-2xl border border-slate-700"
              />
            ) : (
              <div className="w-full h-48 bg-slate-800 rounded-2xl flex items-center justify-center">
                <p className="text-xs text-slate-600">画像を取得できませんでした</p>
              </div>
            )}
          </div>

          <div className="border border-slate-700 rounded-[1.5rem] p-6 space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Direct Cheers オーナー</p>
            <p className="text-sm text-slate-400">面談を実施し、本人確認および利用規約の説明を完了したことを証明します。</p>
            {doc.admin_signature_url ? (
              <img
                src={doc.admin_signature_url}
                alt="オーナーのサイン"
                className="w-full h-48 object-contain bg-slate-950 rounded-2xl border border-slate-700"
              />
            ) : (
              <div className="w-full h-48 bg-slate-800 rounded-2xl flex items-center justify-center">
                <p className="text-xs text-slate-600">画像を取得できませんでした</p>
              </div>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="text-center space-y-1 pt-4 border-t border-slate-800">
          <p className="text-[10px] text-slate-600 font-mono">Document ID: {doc.id}</p>
        </div>

      </div>
    </div>
  );
}
