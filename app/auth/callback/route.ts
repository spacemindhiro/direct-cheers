import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const redirect = searchParams.get('redirect');
  const type = searchParams.get('type') as 'signup' | 'recovery' | 'email' | 'invite' | null;

  const supabase = await createClient();

  const errRedirect = (msg: string) =>
    NextResponse.redirect(`${origin}/auth/error?error=${encodeURIComponent(msg)}`);

  let authUser: { id: string; user_metadata?: Record<string, unknown> } | null = null;

  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) return errRedirect(`verifyOtp: ${error.message}`);
    if (type === 'recovery') return NextResponse.redirect(`${origin}/auth/update-password`);
    authUser = data.user;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return errRedirect(`exchangeCode: ${error.message}`);
    if (type === 'recovery') return NextResponse.redirect(`${origin}/auth/update-password`);
    authUser = data.user;
  } else {
    return errRedirect(
      `no_code: params=${[...new URL(request.url).searchParams.entries()]
        .map(([k, v]) => `${k}=${v}`)
        .join('&')}`
    );
  }

  if (!authUser) {
    return errRedirect('no_user_after_exchange');
  }

  // exchangeCodeForSession 直後は同一リクエスト内でクッキーが読めないため admin クライアントでプロフィール確認
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('profile_id')
    .eq('profile_id', authUser.id)
    .maybeSingle();

  if (profile) {
    return NextResponse.redirect(`${origin}${redirect ?? '/dashboard'}`);
  }

  if (authUser.user_metadata?.skip_onboarding) {
    await admin.from('profiles').insert({
      profile_id: authUser.id,
      role: 'user',
      status: 'active',
    });
    return NextResponse.redirect(`${origin}${redirect ?? '/dashboard'}`);
  }

  const onboarding = redirect
    ? `/onboarding/profile?redirect=${encodeURIComponent(redirect)}`
    : '/onboarding/profile';
  const dest = `/auth/passkey-setup?redirect=${encodeURIComponent(onboarding)}`;
  return NextResponse.redirect(`${origin}${dest}`);
}
