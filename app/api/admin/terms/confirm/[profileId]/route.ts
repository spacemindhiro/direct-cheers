import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TERMS_VERSIONS, getRequiredTermsTypes, type TermsType } from '@/lib/terms';

const REQUIRES_CONFIRMATION: TermsType[] = ['organizer', 'agent'];

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: adminProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('profile_id', user.id)
    .single();

  if (adminProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { profileId } = await params;

  const { data: targetProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('profile_id', profileId)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const required = getRequiredTermsTypes(targetProfile.role);
  const confirmableTypes = required.filter((t) => REQUIRES_CONFIRMATION.includes(t));

  if (confirmableTypes.length === 0) {
    return NextResponse.json({ error: 'このロールには面談承認が必要な規約がありません' }, { status: 400 });
  }

  // デジタル同意が済んでいる型のみ確認可能
  const { data: agreements } = await admin
    .from('terms_agreements')
    .select('terms_type, version, agreed_at')
    .eq('profile_id', profileId)
    .in('terms_type', confirmableTypes);

  const now = new Date().toISOString();
  const toConfirm = (agreements ?? []).filter(
    (a) => a.agreed_at && confirmableTypes.includes(a.terms_type as TermsType) && a.version === TERMS_VERSIONS[a.terms_type as TermsType]
  );

  if (toConfirm.length === 0) {
    return NextResponse.json({ error: '対象ユーザーがまだデジタル同意を完了していません' }, { status: 400 });
  }

  const { error } = await admin
    .from('terms_agreements')
    .update({ confirmed_at: now, confirmed_by: user.id })
    .eq('profile_id', profileId)
    .in('terms_type', toConfirm.map((a) => a.terms_type))
    .is('confirmed_at', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, confirmed: toConfirm.map((a) => a.terms_type) });
}
