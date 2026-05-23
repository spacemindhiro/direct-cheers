import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TERMS_VERSIONS, getRequiredTermsTypes, type TermsType } from '@/lib/terms';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('profile_id', user.id)
    .single();

  const role = profile?.role ?? '';
  const required = getRequiredTermsTypes(role);

  const { data: agreements } = await admin
    .from('terms_agreements')
    .select('terms_type, version')
    .eq('profile_id', user.id);

  const agreedMap = new Map(
    (agreements ?? []).map((a) => [`${a.terms_type}:${a.version}`, true])
  );

  const status: Record<TermsType, { required: boolean; agreed: boolean; version: string }> = {
    base:       { required: required.includes('base'),       agreed: agreedMap.has(`base:${TERMS_VERSIONS.base}`),       version: TERMS_VERSIONS.base },
    organizer:  { required: required.includes('organizer'),  agreed: agreedMap.has(`organizer:${TERMS_VERSIONS.organizer}`),  version: TERMS_VERSIONS.organizer },
    agent:      { required: required.includes('agent'),      agreed: agreedMap.has(`agent:${TERMS_VERSIONS.agent}`),      version: TERMS_VERSIONS.agent },
  };

  const allAgreed = required.every((t) => status[t].agreed);

  return NextResponse.json({ role, status, allAgreed });
}
