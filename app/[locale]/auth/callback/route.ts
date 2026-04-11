import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirect = searchParams.get('redirect'); // 招待リンクからの引き継ぎ

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('profile_id')
          .eq('profile_id', user.id)
          .maybeSingle();

        if (profile) {
          // プロフィール設定済み: redirect 先があればそこへ、なければダッシュボード
          return NextResponse.redirect(`${origin}${redirect ?? '/dashboard'}`);
        } else {
          // 未設定: オンボーディングへ（redirect はクエリで引き継ぐ）
          const dest = redirect
            ? `/onboarding/profile?redirect=${encodeURIComponent(redirect)}`
            : '/onboarding/profile';
          return NextResponse.redirect(`${origin}${dest}`);
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`);
}
