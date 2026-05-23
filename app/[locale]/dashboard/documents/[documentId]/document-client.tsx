'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, FileText } from 'lucide-react';
import { TERMS_LABELS, type TermsType } from '@/lib/terms';

type DocData = {
  id: string;
  signed_at: string;
  terms_types: TermsType[];
  terms_version: string;
  admin_signature_url: string | null;
  subject_signature_url: string | null;
  signed_by_name: string | null;
};

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

  return (
    <div className="max-w-lg mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/profile" className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">My Account</p>
          <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">利用規約同意書</h1>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-4">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
          <FileText size={12} /> 文書情報
        </p>
        <dl className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">調印日時</dt>
            <dd className="text-sm text-slate-300 text-right">
              {signedAt.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </dd>
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
        </dl>
      </div>

      <div className="space-y-4">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-center">Signatures</p>
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] p-5 space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">あなたのサイン</p>
            {doc.subject_signature_url ? (
              <div className="bg-white rounded-xl p-2">
                <img src={doc.subject_signature_url} alt="署名者のサイン" className="w-full h-auto object-contain max-h-32" />
              </div>
            ) : (
              <div className="bg-slate-800 rounded-xl h-24 flex items-center justify-center">
                <p className="text-xs text-slate-600">画像を取得できませんでした</p>
              </div>
            )}
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] p-5 space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Direct Cheers オーナーのサイン</p>
            {doc.admin_signature_url ? (
              <div className="bg-white rounded-xl p-2">
                <img src={doc.admin_signature_url} alt="オーナーのサイン" className="w-full h-auto object-contain max-h-32" />
              </div>
            ) : (
              <div className="bg-slate-800 rounded-xl h-24 flex items-center justify-center">
                <p className="text-xs text-slate-600">画像を取得できませんでした</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
