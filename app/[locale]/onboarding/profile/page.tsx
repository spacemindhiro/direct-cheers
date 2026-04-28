'use client';

import { Suspense, useState, useTransition, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { User, ArrowRight, Loader2 } from 'lucide-react';
import type { PasskeySetup as PasskeySetupType } from '@/components/passkey-setup';

export default function ProfileSetupPage() {
  return (
    <Suspense>
      <ProfileSetupForm />
    </Suspense>
  );
}

function ProfileSetupForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profileDone, setProfileDone] = useState(false);
  const [PasskeySetup, setPasskeySetup] = useState<typeof PasskeySetupType | null>(null);

  useEffect(() => {
    import('@/components/passkey-setup')
      .then(m => setPasskeySetup(() => m.PasskeySetup))
      .catch(() => {});
  }, []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect');

  const handleSubmit = (formData: FormData) => {
    const displayName = (formData.get('display_name') as string).trim();
    const instagram = (formData.get('instagram') as string).trim();
    const soundcloud = (formData.get('soundcloud') as string).trim();
    const website = (formData.get('website') as string).trim();

    startTransition(async () => {
      setError(null);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth/login');
        return;
      }

      const socialLinks: Record<string, string> = {};
      if (instagram) socialLinks.instagram = instagram;
      if (soundcloud) socialLinks.soundcloud = soundcloud;
      if (website) socialLinks.website = website;

      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          profile_id: user.id,
          display_name: displayName,
          role: 'user',
          social_links: socialLinks,
        });

      if (insertError) {
        setError(insertError.message);
      } else {
        setUserEmail(user.email ?? null);
        setProfileDone(true);
      }
    });
  };

  if (profileDone) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
              Step 2 / 2
            </p>
            <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
              Passkey Setup
            </h1>
            <p className="text-sm text-slate-400 font-medium">
              次回から顔認証・指紋認証でログインできます
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-5">
            <p className="text-xs text-slate-500 leading-relaxed">
              パスキーを登録しておくと、次回以降はパスワード不要でログインできます。iCloud キーチェーンや Google パスワードマネージャーを使っている場合は自動的に同期されます。
            </p>
            {userEmail && PasskeySetup ? (
              <PasskeySetup
                email={userEmail}
                mode="register"
                onSuccess={() => router.push(redirectTo ?? '/dashboard')}
                buttonLabel="パスキーを登録してダッシュボードへ"
              />
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => router.push(redirectTo ?? '/dashboard')}
            className="w-full text-center text-xs text-slate-600 hover:text-slate-400 font-bold transition-colors py-2"
          >
            スキップしてダッシュボードへ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md space-y-8">

        {/* ヘッダー */}
        <div className="text-center space-y-2">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
            Step 1 / 2
          </p>
          <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
            Profile Setup
          </h1>
          <p className="text-sm text-slate-400 font-medium">
            あなたの表示名を設定してください
          </p>
        </div>

        {/* フォーム */}
        <form action={handleSubmit} className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 space-y-6">

            {/* 表示名 */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <User size={12} className="text-pink-500" />
                Display Name <span className="text-pink-500">*</span>
              </label>
              <input
                type="text"
                name="display_name"
                placeholder="あなたの名前またはニックネーム"
                required
                className="w-full h-14 bg-slate-950/50 border border-slate-700 rounded-2xl px-5 text-sm text-white focus:border-pink-500 outline-none transition-all placeholder:text-slate-600 font-bold"
              />
            </div>

            {/* SNSリンク（任意） */}
            <div className="space-y-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                Social Links <span className="text-slate-600 normal-case font-normal">（任意）</span>
              </p>
              <input
                type="text"
                name="instagram"
                placeholder="Instagram URL"
                className="w-full h-12 bg-slate-950/50 border border-slate-800 rounded-xl px-5 text-sm text-white focus:border-pink-500/50 outline-none transition-all placeholder:text-slate-700 font-medium"
              />
              <input
                type="text"
                name="soundcloud"
                placeholder="SoundCloud URL"
                className="w-full h-12 bg-slate-950/50 border border-slate-800 rounded-xl px-5 text-sm text-white focus:border-pink-500/50 outline-none transition-all placeholder:text-slate-700 font-medium"
              />
              <input
                type="url"
                name="website"
                placeholder="Website URL"
                className="w-full h-12 bg-slate-950/50 border border-slate-800 rounded-xl px-5 text-sm text-white focus:border-pink-500/50 outline-none transition-all placeholder:text-slate-700 font-medium"
              />
            </div>

          </div>

          {error && (
            <p className="text-sm text-red-400 text-center font-bold">{error}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>
                ダッシュボードへ進む
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
