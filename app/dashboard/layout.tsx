import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { LogoutButton } from '@/components/logout-button';
import { Loader2 } from 'lucide-react';

async function DashboardNav() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, role')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (!profile) redirect('/onboarding/profile');

  return (
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
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest hidden sm:block">
            {profile.display_name}
          </span>
          <LogoutButton />
        </div>
      </div>
    </nav>
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
