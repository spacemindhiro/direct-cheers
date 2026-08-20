import { Suspense } from 'react';
import { createClient, getUser } from '@/lib/supabase/server';
import { HelpContent, type HelpRole } from '@/components/help-content';

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

    if (profile?.role === 'organizer' || profile?.role === 'agent') defaultRole = 'organizer';
    if (profile?.role === 'artist') defaultRole = 'artist';
  }

  return <HelpContent defaultRole={defaultRole} />;
}

export default function HelpPage() {
  return (
    <Suspense fallback={null}>
      <HelpPageContent />
    </Suspense>
  );
}
