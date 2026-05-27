import { Suspense } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Loader2, ArrowLeft, FileText } from 'lucide-react';
import { TERMS_LABELS } from '@/lib/terms';

const JST = { timeZone: 'Asia/Tokyo' } as const;

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

  const subject = subjectResult.data;
  const signer  = signerResult.data;
  const signedAt = new Date(doc.signed_at);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Link href="/admin/documents" className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Admin · Documents</p>
          <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">署名済み文書</h1>
        </div>
      </div>

      {/* メタデータ */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-4">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
          <FileText size={12} /> 文書情報
        </p>
        <dl className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">署名者</dt>
            <dd className="text-sm font-black text-white text-right">{subject?.display_name ?? '—'}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">承認者</dt>
            <dd className="text-sm text-slate-300 text-right">{signer?.display_name ?? '—'}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">調印日時</dt>
            <dd className="text-sm text-slate-300 text-right">
              {signedAt.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', ...JST })}
              {' '}
              {signedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', ...JST })}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">バージョン</dt>
            <dd className="text-sm text-slate-300 text-right">{doc.terms_version}</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0 mt-0.5">規約種別</dt>
            <dd className="flex flex-wrap gap-1.5 justify-end">
              {(doc.terms_types as string[]).map((t) => (
                <span key={t} className="text-[9px] font-black px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 uppercase tracking-wider">
                  {TERMS_LABELS[t as keyof typeof TERMS_LABELS] ?? t}
                </span>
              ))}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="text-[10px] font-black text-slate-500 uppercase tracking-wider shrink-0">文書ID</dt>
            <dd className="text-[10px] text-slate-600 font-mono text-right break-all">{doc.id}</dd>
          </div>
        </dl>
      </div>

      {/* 署名画像 */}
      <div className="space-y-4">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-center">Signatures</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] p-5 space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">署名者</p>
            <p className="text-xs font-black text-white">{subject?.display_name ?? '—'}</p>
            {subjectSigResult.data?.signedUrl ? (
              <div className="bg-white rounded-xl p-2">
                <img
                  src={subjectSigResult.data.signedUrl}
                  alt="署名者のサイン"
                  className="w-full h-auto object-contain max-h-32"
                />
              </div>
            ) : (
              <div className="bg-slate-800 rounded-xl h-24 flex items-center justify-center">
                <p className="text-xs text-slate-600">画像取得エラー</p>
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] p-5 space-y-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Direct Cheers オーナー</p>
            <p className="text-xs font-black text-white">{signer?.display_name ?? '—'}</p>
            {adminSigResult.data?.signedUrl ? (
              <div className="bg-white rounded-xl p-2">
                <img
                  src={adminSigResult.data.signedUrl}
                  alt="オーナーのサイン"
                  className="w-full h-auto object-contain max-h-32"
                />
              </div>
            ) : (
              <div className="bg-slate-800 rounded-xl h-24 flex items-center justify-center">
                <p className="text-xs text-slate-600">画像取得エラー</p>
              </div>
            )}
          </div>

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
