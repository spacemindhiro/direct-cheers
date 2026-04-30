import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirect = searchParams.get('redirect');
  const type = searchParams.get('type');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/auth/update-password`);
      }

      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('profile_id')
          .eq('profile_id', user.id)
          .maybeSingle();

        if (profile) {
          return NextResponse.redirect(`${origin}${redirect ?? '/dashboard'}`);
        } else {
          const onboarding = redirect
            ? `/onboarding/profile?redirect=${encodeURIComponent(redirect)}`
            : '/onboarding/profile';
          const dest = `/auth/passkey-setup?redirect=${encodeURIComponent(onboarding)}`;
          return NextResponse.redirect(`${origin}${dest}`);
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`);
}
