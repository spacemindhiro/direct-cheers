import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('signed_documents')
    .select('id, signed_at, terms_types')
    .eq('profile_id', user.id)
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!doc) return NextResponse.json({ document: null });
  return NextResponse.json({ document: doc });
}
