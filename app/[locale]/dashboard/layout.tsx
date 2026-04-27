import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { LogoutButton } from '@/components/logout-button';
import { Loader2, UserCircle } from 'lucide-react';
import { StripeRestrictionBanner } from '@/components/stripe-restriction-banner';

async function DashboardNav() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, role, stripe_restricted, stripe_connect_id, avatar_url')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (!profile) redirect('/onboarding/profile');

  return (
    <>
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <img
              src="/logo-emblem.png"
              alt="Direct Cheers"
              className="w-7 h-7 rounded-lg shadow-lg shadow-pink-500/10 group-hover:scale-110 transition-transform"
            />
            <span className="text-lg font-black tracking-tighter text-white uppercase italic">
              Direct Cheers
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/profile"
              className="flex items-center gap-2 group"
            >
              <div className="w-9 h-9 bg-slate-800 border border-slate-700 group-hover:border-pink-500/50 rounded-2xl flex items-center justify-center transition-all overflow-hidden">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
                ) : (
                  <UserCircle size={18} className="text-slate-400 group-hover:text-pink-500 transition-colors" />
                )}
              </div>
              <span className="text-[10px] font-bold text-slate-500 group-hover:text-pink-500 uppercase tracking-widest hidden sm:block transition-colors">
                {profile.display_name}
              </span>
            </Link>
            <LogoutButton />
          </div>
        </div>
      </nav>
      {profile?.stripe_connect_id && profile?.stripe_restricted && (
        <StripeRestrictionBanner />
      )}
    </>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <Suspense fallback={
        <div className="h-16 border-b border-slate-800 flex items-center justify-center">
          <Loader2 className="animate-spin text-slate-600" size={20} />
        </div>
      }>
        <DashboardNav />
      </Suspense>
      <main className="max-w-5xl mx-auto px-6 py-10">
        {children}
      </main>
    </div>
  );
}
