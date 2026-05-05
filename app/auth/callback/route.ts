import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const redirect = searchParams.get('redirect');
  const type = searchParams.get('type') as 'signup' | 'recovery' | 'email' | 'invite' | null;

  const supabase = await createClient();

  const errRedirect = (msg: string) =>
    NextResponse.redirect(`${origin}/auth/error?error=${encodeURIComponent(msg)}`);

  // token_hash 方式（OTP）の処理
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) return errRedirect(`verifyOtp: ${error.message}`);
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/auth/update-password`);
    }
  } else if (code) {
    // PKCE code 方式の処理
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return errRedirect(`exchangeCode: ${error.message}`);
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/auth/update-password`);
    }
  } else {
    return errRedirect(`no_code: params=${[...new URL(request.url).searchParams.entries()].map(([k,v])=>`${k}=${v}`).join('&')}`);
  }

  // セッション確立済み → ユーザー・プロフィール確認
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/auth/error`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('profile_id')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (profile) {
    return NextResponse.redirect(`${origin}${redirect ?? '/dashboard'}`);
  }

  // 招待ユーザー（skip_onboarding）はファンプロフィールを自動作成してダッシュボードへ
  if (user.user_metadata?.skip_onboarding) {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const adminForCallback = createAdminClient();
    await adminForCallback.from('profiles').insert({
      profile_id: user.id,
      role: 'fan',
      status: 'active',
    });
    return NextResponse.redirect(`${origin}${redirect ?? '/dashboard'}`);
  }

  // 通常新規ユーザー → passkey-setup → onboarding
  const onboarding = redirect
    ? `/onboarding/profile?redirect=${encodeURIComponent(redirect)}`
    : '/onboarding/profile';
  const dest = `/auth/passkey-setup?redirect=${encodeURIComponent(onboarding)}`;
  return NextResponse.redirect(`${origin}${dest}`);
}
