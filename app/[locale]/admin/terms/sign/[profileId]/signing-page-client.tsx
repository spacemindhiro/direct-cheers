'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, FileText, CheckCircle2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { SignatureCanvas } from '@/components/signature-canvas';
import {
  TERMS_CONTENT,
  TERMS_LABELS,
  getRequiredTermsTypes,
  type TermsType,
} from '@/lib/terms';

type ProfileData = {
  display_name: string | null;
  role: string;
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
                    {i + 1 > 1 ? `${i + 1}．` : ''}{p}
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

export function SigningPageClient({ profileId }: { profileId: string }) {
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminSig, setAdminSig] = useState<string | null>(null);
  const [subjectSig, setSubjectSig] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/users/${profileId}/profile`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setProfile(data);
      })
      .finally(() => setLoading(false));
  }, [profileId]);

  const requiredTypes = profile ? getRequiredTermsTypes(profile.role) : [];
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  const handleSubmit = async () => {
    if (!adminSig || !subjectSig || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/terms/sign/${profileId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSignature: adminSig,
          subjectSignature: subjectSig,
          termsTypes: requiredTypes,
        }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => router.push('/admin/users'), 2000);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <Loader2 className="animate-spin text-slate-600" size={32} />
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 gap-4">
        <CheckCircle2 size={48} className="text-emerald-400" />
        <p className="text-xl font-black text-white">調印完了</p>
        <p className="text-sm text-slate-500">管理画面に戻ります…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/users" className="w-10 h-10 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Signing Ceremony</p>
          <p className="text-sm font-black text-white truncate">{profile?.display_name ?? '—'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <FileText size={14} className="text-slate-500" />
          <span className="text-[10px] text-slate-500 font-bold">{today}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8 space-y-8 pb-32">

        {/* 書面タイトル */}
        <div className="text-center space-y-3 py-6 border-b border-slate-800">
          <p className="text-sm font-black text-slate-500 uppercase tracking-[0.4em]">Direct Cheers</p>
          <h1 className="text-4xl font-black text-white">利用規約 同意書</h1>
          <p className="text-base text-slate-500">{today}</p>
          {profile && (
            <p className="text-lg text-slate-300">
              署名者：<span className="font-black text-white">{profile.display_name}</span>
              　（{profile.role}）
            </p>
          )}
        </div>

        {/* 規約全文 */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] px-8 py-8">
          <TermsText types={requiredTypes} />
        </div>

        {/* 署名セクション */}
        <div className="space-y-4">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] text-center">Signatures</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* 相手の署名 */}
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-5 space-y-4">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">署名者</p>
                <p className="text-sm font-black text-white mt-0.5">{profile?.display_name ?? '—'}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  上記の利用規約を熟読し、全条項に同意します。
                </p>
              </div>
              <SignatureCanvas onSignature={setSubjectSig} />
            </div>

            {/* オーナー署名 */}
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-5 space-y-4">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Direct Cheers オーナー</p>
                <p className="text-sm font-black text-white mt-0.5">確認・承認</p>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  面談を実施し、本人確認および規約説明を完了したことを証します。
                </p>
              </div>
              <SignatureCanvas onSignature={setAdminSig} />
            </div>

          </div>
        </div>

        {/* 提出ボタン */}
        <div className="space-y-3">
          {(!adminSig || !subjectSig) && (
            <p className="text-center text-[11px] text-slate-600 font-bold">
              両名のサインが必要です
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!adminSig || !subjectSig || submitting}
            className="w-full h-16 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:brightness-110 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(99,102,241,0.3)]"
          >
            {submitting ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>
                <CheckCircle2 size={18} />
                調印完了・書面を保管する
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
