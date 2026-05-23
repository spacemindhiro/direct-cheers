import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { documentId } = await params;
  const admin = createAdminClient();

  const { data: doc } = await admin
    .from('signed_documents')
    .select(`
      id,
      signed_at,
      terms_types,
      terms_version,
      admin_signature_path,
      subject_signature_path,
      profile_id,
      signer:profiles!signed_by(display_name)
    `)
    .eq('id', documentId)
    .eq('profile_id', user.id)
    .single();

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [adminSig, subjectSig] = await Promise.all([
    admin.storage.from('signed-agreements').createSignedUrl(doc.admin_signature_path, 3600),
    admin.storage.from('signed-agreements').createSignedUrl(doc.subject_signature_path, 3600),
  ]);

  const signer = doc.signer as unknown as { display_name: string | null } | null;

  return NextResponse.json({
    id: doc.id,
    signed_at: doc.signed_at,
    terms_types: doc.terms_types,
    terms_version: doc.terms_version,
    admin_signature_url: adminSig.data?.signedUrl ?? null,
    subject_signature_url: subjectSig.data?.signedUrl ?? null,
    signed_by_name: signer?.display_name ?? null,
  });
}
