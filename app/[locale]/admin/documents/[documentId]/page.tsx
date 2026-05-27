import { Suspense } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Loader2, ArrowLeft } from 'lucide-react';
import {
  TERMS_LABELS,
  TERMS_CONTENT,
  type TermsType,
} from '@/lib/terms';

const JST = { timeZone: 'Asia/Tokyo' } as const;

const ROLE_LABELS: Record<string, string> = {
  agent:     'エージェント',
  organizer: 'オーガナイザー',
  artist:    'アーティスト / DJ',
  admin:     '管理者',
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

async function DocumentContent({ params }: { params: Promise<{ documentId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('profile_id', user.id).single();
  if (me?.role !== 'admin') redirect('/dashboard');

  const { documentId } = await params;

  const { data: doc } = await admin
    .from('signed_documents')
    .select('id, signed_at, terms_types, terms_version, admin_signature_path, subject_signature_path, profile_id, signed_by')
    .eq('id', documentId)
    .single();

  if (!doc) notFound();

  const [subjectResult, signerResult, adminSigResult, subjectSigResult] = await Promise.all([
    admin.from('profiles').select('display_name, role').eq('profile_id', doc.profile_id).single(),
    admin.from('profiles').select('display_name').eq('profile_id', doc.signed_by).single(),
    admin.storage.from('signed-agreements').createSignedUrl(doc.admin_signature_path, 3600),
    admin.storage.from('signed-agreements').createSignedUrl(doc.subject_signature_path, 3600),
  ]);

  const subject    = subjectResult.data;
  const signer     = signerResult.data;
  const signedAt   = new Date(doc.signed_at);
  const termsTypes = doc.terms_types as TermsType[];

  const dateLabel = signedAt.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', ...JST,
  });
  const timeLabel = signedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', ...JST });

  return (
    <div className="space-y-8 pb-8">

      {/* 戻るボタン */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/documents"
          className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Signed Document</p>
          <p className="text-lg font-black text-white">{subject?.display_name ?? '—'}</p>
        </div>
      </div>

      {/* 書面本体 */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] px-8 py-10 space-y-10">

        {/* タイトル */}
        <div className="text-center space-y-3 pb-8 border-b border-slate-800">
          <p className="text-sm font-black text-slate-500 uppercase tracking-[0.4em]">Direct Cheers</p>
          <h1 className="text-4xl font-black text-white">利用規約 同意書</h1>
          <p className="text-base text-slate-500">{dateLabel}　{timeLabel}</p>
          {subject && (
            <p className="text-lg text-slate-300">
              署名者：<span className="font-black text-white">{subject.display_name}</span>
              　（{ROLE_LABELS[subject.role] ?? subject.role}）
            </p>
          )}
        </div>

        {/* 規約全文 */}
        <TermsText types={termsTypes} />

        {/* 署名 */}
        <div className="space-y-6 pt-4 border-t border-slate-800">
          <p className="text-sm font-black text-slate-500 uppercase tracking-[0.4em] text-center">Signatures</p>

          {/* 署名者 */}
          <div className="border border-slate-700 rounded-[1.5rem] p-6 space-y-4">
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">署名者</p>
              <p className="text-xl font-black text-white mt-1">{subject?.display_name ?? '—'}</p>
              <p className="text-sm text-slate-400 mt-1">上記の利用規約を熟読し、全条項に同意します。</p>
            </div>
            {subjectSigResult.data?.signedUrl ? (
              <img
                src={subjectSigResult.data.signedUrl}
                alt="署名者のサイン"
                className="w-full h-64 object-contain bg-slate-950 rounded-2xl border border-slate-700"
              />
            ) : (
              <div className="w-full h-64 bg-slate-800 rounded-2xl flex items-center justify-center">
                <p className="text-sm text-slate-600">署名画像を取得できませんでした</p>
              </div>
            )}
          </div>

          {/* オーナー */}
          <div className="border border-slate-700 rounded-[1.5rem] p-6 space-y-4">
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Direct Cheers オーナー</p>
              <p className="text-xl font-black text-white mt-1">{signer?.display_name ?? '—'}</p>
              <p className="text-sm text-slate-400 mt-1">面談を実施し、本人確認および利用規約の説明を完了したことを証明します。</p>
            </div>
            {adminSigResult.data?.signedUrl ? (
              <img
                src={adminSigResult.data.signedUrl}
                alt="オーナーのサイン"
                className="w-full h-64 object-contain bg-slate-950 rounded-2xl border border-slate-700"
              />
            ) : (
              <div className="w-full h-64 bg-slate-800 rounded-2xl flex items-center justify-center">
                <p className="text-sm text-slate-600">署名画像を取得できませんでした</p>
              </div>
            )}
          </div>
        </div>

        {/* 文書フッター */}
        <div className="text-center space-y-1 pt-4 border-t border-slate-800">
          <p className="text-[10px] text-slate-600 font-mono">Document ID: {doc.id}</p>
          <p className="text-[10px] text-slate-600">Version: {doc.terms_version}</p>
        </div>

      </div>
    </div>
  );
}

export default function AdminDocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-600" size={32} />
      </div>
    }>
      <DocumentContent params={params} />
    </Suspense>
  );
}
