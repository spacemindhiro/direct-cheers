import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { UserCircle, MessageCircle } from "lucide-react";

async function AdminHeader() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect('/auth/login');

  const [{ data: profile }, { data: convParticipants }] = await Promise.all([
    supabase.from('profiles').select('display_name, avatar_url').eq('profile_id', user.id).maybeSingle(),
    supabase.from('conversation_participants').select('last_read_at, conversations!inner(updated_at)').eq('profile_id', user.id),
  ]);

  const unreadCount = (convParticipants ?? []).filter((cp) => {
    const updatedAt = (cp.conversations as unknown as { updated_at: string } | null)?.updated_at;
    if (!updatedAt) return false;
    if (!cp.last_read_at) return true;
    return new Date(updatedAt) > new Date(cp.last_read_at);
  }).length;

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
      <div className="max-w-5xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-6">
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
          <span className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em] border border-pink-500/30 px-2 py-1 rounded-lg">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/messages"
            className="relative w-9 h-9 bg-slate-800 border border-slate-700 hover:border-pink-500/50 rounded-2xl flex items-center justify-center transition-all"
          >
            <MessageCircle size={18} className="text-slate-400 hover:text-pink-500 transition-colors" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-pink-500 rounded-full flex items-center justify-center text-[9px] font-black text-white px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
          <Link href="/dashboard/profile" className="flex items-center gap-2 group">
            <div className="w-9 h-9 bg-slate-800 border border-slate-700 group-hover:border-pink-500/50 rounded-2xl flex items-center justify-center transition-all overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.display_name ?? ''} className="w-full h-full object-cover" />
              ) : (
                <UserCircle size={18} className="text-slate-400 group-hover:text-pink-500 transition-colors" />
              )}
            </div>
            <span className="text-[10px] font-bold text-slate-500 group-hover:text-pink-500 uppercase tracking-widest hidden sm:block transition-colors">
              {profile?.display_name}
            </span>
          </Link>
          <LogoutButton />
        </div>
      </div>
    </nav>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <AdminHeader />
      <main className="max-w-5xl mx-auto px-6 py-10">
        {children}
      </main>
    </div>
  );
}
