import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  let redirect = searchParams.get('redirect');
  const type = searchParams.get('type') as 'signup' | 'recovery' | 'email' | 'invite' | null;

  const supabase = await createClient();

  const errRedirect = (msg: string) =>
    NextResponse.redirect(`${origin}/auth/error?error=${encodeURIComponent(msg)}`);

  let authUser: { id: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> } | null = null;

  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) return errRedirect(`verifyOtp: ${error.message}`);
    if (type === 'recovery') return NextResponse.redirect(`${origin}/auth/update-password`);
    authUser = data.user;
    // token_hash フロー（クロスブラウザ対応）: redirect を user_metadata から補完
    if (!redirect && authUser?.user_metadata?.post_auth_redirect) {
      redirect = authUser.user_metadata.post_auth_redirect as string;
    }
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return errRedirect(`exchangeCode: ${error.message}`);
    if (type === 'recovery') return NextResponse.redirect(`${origin}/auth/update-password`);
    authUser = data.user;
  } else {
    const errorCode = searchParams.get('error_code');
    if (errorCode === 'otp_expired') {
      return NextResponse.redirect(`${origin}/auth/error?error=otp_expired`);
    }
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

  // Google 等 OAuth ログインはオンボーディング不要
  if (authUser.app_metadata?.provider !== 'email') {
    await admin.from('profiles').insert({
      profile_id: authUser.id,
      display_name: (authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? null) as string | null,
      role: 'user',
      status: 'active',
    });
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

  const dest = redirect
    ? `/onboarding/profile?redirect=${encodeURIComponent(redirect)}`
    : '/onboarding/profile';
  return NextResponse.redirect(`${origin}${dest}`);
}
