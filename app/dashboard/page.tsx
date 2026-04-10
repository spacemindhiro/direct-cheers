import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { Zap, Heart, Wallet, ChevronRight, UserCheck, Loader2 } from 'lucide-react';

async function DashboardContent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, role, verification_status, created_at')
    .eq('profile_id', user!.id)
    .single();

  const roleLabelMap: Record<string, string> = {
    user: 'ファン',
    artist: 'アーティスト',
    organizer: 'オーガナイザー',
    agent: 'エージェント',
    admin: '管理者',
  };

  const roleLabel = roleLabelMap[profile?.role ?? 'user'] ?? profile?.role;

  return (
    <div className="space-y-10">

      {/* ウェルカム */}
      <div className="space-y-1">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">
          Dashboard
        </p>
        <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter">
          Hey, {profile?.display_name}
        </h1>
        <p className="text-slate-500 text-sm font-medium">
          ロール：<span className="text-slate-300 font-bold">{roleLabel}</span>
        </p>
      </div>

      {/* ステータスカード */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-3">
          <div className="w-10 h-10 bg-pink-500/10 rounded-2xl flex items-center justify-center border border-pink-500/20">
            <Heart size={20} className="text-pink-500" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Total Cheers</p>
            <p className="text-3xl font-black text-white italic tracking-tighter">0</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-3">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
            <Zap size={20} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Total Amount</p>
            <p className="text-3xl font-black text-white italic tracking-tighter">¥0</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-3">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
            <Wallet size={20} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Wallet Cards</p>
            <p className="text-3xl font-black text-white italic tracking-tighter">0</p>
          </div>
        </div>
      </div>

      {/* 応援履歴（空） */}
      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
          <Heart size={14} className="text-pink-500" /> Cheers History
        </h2>
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center space-y-3">
          <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">No cheers yet.</p>
          <p className="text-slate-700 text-xs">イベントでQRをスキャンして最初の応援を送ろう</p>
        </div>
      </div>

      {/* ロールアップグレード誘導 */}
      {profile?.role === 'user' && (
        <div className="space-y-4">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <UserCheck size={14} className="text-pink-500" /> アーティスト・オーガナイザー申請
          </h2>
          <div className="bg-slate-900 border border-pink-500/20 rounded-[2rem] p-6 flex items-center justify-between group hover:border-pink-500/50 transition-all cursor-pointer">
            <div className="space-y-1">
              <p className="text-sm font-black text-white uppercase tracking-tight">
                クリエイターとして参加する
              </p>
              <p className="text-xs text-slate-500 font-medium">
                アーティストまたはオーガナイザーへのロールアップグレードを申請できます
              </p>
            </div>
            <ChevronRight size={20} className="text-slate-600 group-hover:text-pink-500 transition-colors shrink-0 ml-4" />
          </div>
        </div>
      )}

    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-600" size={32} />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
