import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { createClient, getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { StepUpForm } from '@/components/step-up-form';

const STEP_UP_TTL_MS = 480 * 60 * 1000;

async function StepUpContent({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectTo = '/dashboard' } = await searchParams;

  const supabase = await createClient();
  const user = await getUser();
  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent(redirectTo)}`);
  }

  // すでにステップアップ済みなら即リダイレクト
  const cookieStore = await cookies();
  const stepUpAt = cookieStore.get('dc_stepup')?.value;
  const isFresh = !!stepUpAt && (Date.now() - parseInt(stepUpAt)) < STEP_UP_TTL_MS;
  if (isFresh) {
    redirect(redirectTo);
  }

  // パスキー登録済みかチェック
  const admin = createAdminClient();
  const { count } = await admin
    .from('passkey_credentials')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', user.id);
  const hasPasskeys = (count ?? 0) > 0;

  return (
    <StepUpForm
      email={user.email!}
      redirectTo={redirectTo}
      hasPasskeys={hasPasskeys}
    />
  );
}

export default function StepUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  return (
    <div className="min-h-screen bg-slate-950 font-sans flex flex-col">
      <div className="px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <img
            src="/logo-emblem.png"
            alt="Direct Cheers"
            className="w-7 h-7 rounded-lg shadow-lg shadow-pink-500/10 group-hover:scale-110 transition-transform"
          />
          <span className="text-base font-black tracking-tighter text-white uppercase italic">
            Direct Cheers
          </span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <Suspense fallback={
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-slate-600" size={32} />
            </div>
          }>
            <StepUpContent searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
