import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/terms/agreements — ログイン中ユーザー自身の規約同意履歴（全バージョン）
// 同意後に本文を見返せるよう、プロフィールの「規約・同意書」欄と同意済み規約の閲覧ページで使う。
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('terms_agreements')
    .select('terms_type, version, agreed_at, confirmed_at')
    .eq('profile_id', user.id)
    .order('agreed_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agreements: data ?? [] });
}
