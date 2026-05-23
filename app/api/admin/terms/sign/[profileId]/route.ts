import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TERMS_VERSIONS, getRequiredTermsTypes, type TermsType } from '@/lib/terms';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('profile_id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { profileId } = await params;
  const { adminSignature, subjectSignature, termsTypes } = await req.json() as {
    adminSignature: string;
    subjectSignature: string;
    termsTypes: TermsType[];
  };

  if (!adminSignature || !subjectSignature || !termsTypes?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data: targetProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('profile_id', profileId)
    .single();

  if (!targetProfile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const documentId = crypto.randomUUID();
  const now = new Date().toISOString();

  const toBuffer = (dataUrl: string) => {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(base64, 'base64');
  };

  const adminPath   = `${profileId}/${documentId}/admin.png`;
  const subjectPath = `${profileId}/${documentId}/subject.png`;

  const [adminUpload, subjectUpload] = await Promise.all([
    admin.storage.from('signed-agreements').upload(adminPath,   toBuffer(adminSignature),   { contentType: 'image/png' }),
    admin.storage.from('signed-agreements').upload(subjectPath, toBuffer(subjectSignature), { contentType: 'image/png' }),
  ]);

  if (adminUpload.error || subjectUpload.error) {
    return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 });
  }

  // signed_documents に記録
  const { error: docError } = await admin.from('signed_documents').insert({
    id: documentId,
    profile_id: profileId,
    signed_by: user.id,
    terms_types: termsTypes,
    terms_version: TERMS_VERSIONS.base,
    admin_signature_path: adminPath,
    subject_signature_path: subjectPath,
    signed_at: now,
  });

  if (docError) return NextResponse.json({ error: docError.message }, { status: 500 });

  // terms_agreements を upsert して confirmed_at をセット
  const required = getRequiredTermsTypes(targetProfile.role);
  const confirmable = required.filter((t): t is TermsType => termsTypes.includes(t));

  if (confirmable.length > 0) {
    const rows = confirmable.map((t) => ({
      profile_id: profileId,
      terms_type: t,
      version: TERMS_VERSIONS[t],
      agreed_at: now,
      confirmed_at: now,
      confirmed_by: user.id,
    }));
    await admin
      .from('terms_agreements')
      .upsert(rows, { onConflict: 'profile_id,terms_type,version' });
  }

  return NextResponse.json({ ok: true, documentId });
}
