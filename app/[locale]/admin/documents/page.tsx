import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Loader2, FileText, ChevronRight } from 'lucide-react';

const TERMS_TYPE_LABELS: Record<string, string> = {
  base: 'ベース規約',
  organizer: 'オーガナイザー規約',
  agent: 'エージェント規約',
};

async function DocumentsContent() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect('/auth/login');

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('profile_id', user.id).single();
  if (me?.role !== 'admin') redirect('/dashboard');

  const { data: rawDocs } = await admin
    .from('signed_documents')
    .select('id, signed_at, terms_types, terms_version, profile_id, signed_by')
    .order('signed_at', { ascending: false });

  // profile_id と signed_by を一括で取得（同一テーブルへの二重 JOIN を回避）
  const allProfileIds = [...new Set([
    ...(rawDocs ?? []).map((d) => d.profile_id),
    ...(rawDocs ?? []).map((d) => d.signed_by),
  ])];
  const { data: profilesData } = allProfileIds.length > 0
    ? await admin.from('profiles').select('profile_id, display_name, role').in('profile_id', allProfileIds)
    : { data: [] as { profile_id: string; display_name: string | null; role: string }[] };
  const profileMap = Object.fromEntries((profilesData ?? []).map((p) => [p.profile_id, p]));

  const docs = (rawDocs ?? []).map((d) => ({
    ...d,
    subject: profileMap[d.profile_id] ?? null,
    signer: profileMap[d.signed_by] ?? null,
  }));

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Admin</p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">Documents</h1>
        <p className="text-xs text-slate-500">署名済み利用規約同意書 一覧</p>
      </div>

      {!docs?.length ? (
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
          <FileText size={32} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">No documents yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => {
            const subject = doc.subject as unknown as { display_name: string | null; role: string } | null;
            const signer = doc.signer as unknown as { display_name: string | null } | null;
            return (
              <Link
                key={doc.id}
                href={`/admin/documents/${doc.id}`}
                className="flex items-center justify-between bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-[1.5rem] px-6 py-5 transition-all group"
              >
                <div className="space-y-1.5 min-w-0">
                  <p className="text-sm font-black text-white">{subject?.display_name ?? '—'}</p>
                  <p className="text-[10px] text-slate-500">
                    {new Date(doc.signed_at).toLocaleDateString('ja-JP', {
                      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
                    })}
                    {' · '}承認者: {signer?.display_name ?? '—'}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(doc.terms_types as string[]).map((t) => (
                      <span key={t} className="text-[9px] font-black px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 uppercase tracking-wider">
                        {TERMS_TYPE_LABELS[t] ?? t}
                      </span>
                    ))}
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0 ml-4" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminDocumentsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-600" size={32} />
      </div>
    }>
      <DocumentsContent />
    </Suspense>
  );
}
