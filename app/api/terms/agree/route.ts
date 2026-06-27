import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TERMS_VERSIONS, getRequiredTermsTypes, type TermsType } from '@/lib/terms';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { types } = await req.json() as { types: TermsType[] };
  if (!Array.isArray(types) || types.length === 0) {
    return NextResponse.json({ error: 'types is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('profile_id', user.id)
    .single();

  const required = getRequiredTermsTypes(profile?.role ?? '');
  const validTypes: TermsType[] = ['base', 'organizer', 'agent'];

  for (const t of types) {
    if (!validTypes.includes(t)) {
      return NextResponse.json({ error: `Invalid terms type: ${t}` }, { status: 400 });
    }
    if (!required.includes(t)) {
      return NextResponse.json({ error: `Terms type not required for your role: ${t}` }, { status: 400 });
    }
  }

  const rows = types.map((t) => ({
    profile_id: user.id,
    terms_type: t,
    version: TERMS_VERSIONS[t],
  }));

  const { error } = await admin
    .from('terms_agreements')
    .upsert(rows, { onConflict: 'profile_id,terms_type,version', ignoreDuplicates: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
