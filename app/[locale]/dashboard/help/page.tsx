import { Suspense } from 'react';
import { createClient, getUser } from '@/lib/supabase/server';
import { HelpContent, type HelpRole } from '@/components/help-content';

// マニュアルの閲覧範囲は一般ユーザー＜アーティスト＜オーガナイザーの
// ロール上位互換に合わせる(project_role_hierarchy: admin⊇agent⊇organizer⊇artist⊇user)。
// 上位ロールは下位ロールのマニュアルも閲覧できる。
const VISIBLE_ROLES: Record<HelpRole, HelpRole[]> = {
  user: ['user'],
  artist: ['user', 'artist'],
  organizer: ['user', 'artist', 'organizer'],
};

async function HelpPageContent() {
  const user = await getUser();
  let defaultRole: HelpRole = 'user';

  if (user) {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (profile?.role === 'organizer' || profile?.role === 'agent' || profile?.role === 'admin') defaultRole = 'organizer';
    if (profile?.role === 'artist') defaultRole = 'artist';
  }

  return <HelpContent defaultRole={defaultRole} visibleRoles={VISIBLE_ROLES[defaultRole]} />;
}

export default function HelpPage() {
  return (
    <Suspense fallback={null}>
      <HelpPageContent />
    </Suspense>
  );
}
