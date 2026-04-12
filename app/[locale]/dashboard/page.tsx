import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Zap, Heart, Wallet, Loader2, UserPlus, Calendar, BarChart2, ArrowDownToLine, ClipboardCheck, Mic2, HeartHandshake, TrendingUp, Ticket } from 'lucide-react';
import Link from 'next/link';
import { AddToHomeScreen } from '@/components/add-to-homescreen';
import { RoleUpgradeBanner } from '@/components/role-upgrade-drawer';
import { ArtistSalesDashboard } from '@/components/artist-sales-dashboard';
import { FollowButton } from '@/components/follow-button';
import { FollowerHero } from '@/components/follower-hero';

async function DashboardContent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, role, status, verification_status, created_at')
    .eq('profile_id', user!.id)
    .single();

  const admin = createAdminClient();

  // フォロー中一覧
  const { data: followsData } = await admin
    .from('follows')
    .select(`
      follow_id,
      followee_id,
      followee:profiles!followee_id(profile_id, display_name, avatar_url, role)
    `)
    .eq('follower_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const follows = (followsData ?? []).map((f: any) => f.followee).filter(Boolean);

  // Cheers履歴（userロール向け）
  const { data: cheersHistory } = await admin
    .from('transactions')
    .select(`
      transaction_id, total_gross_amount, created_at, sender_comment, sender_name,
      product:products!product_id(name, artist_id, artist:profiles!artist_id(display_name)),
      qr_config:qr_configs!qr_config_id(event_id, event:events!event_id(title))
    `)
    .eq('sender_profile_id', user!.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(20);

  const totalCheersAmount = (cheersHistory ?? []).reduce((s, t) => s + (t.total_gross_amount ?? 0), 0);

  // オーガナイザー / アーティスト向け: 自分が関わるイベントの累計着金予測
  let projectedNet = 0;
  if (['organizer', 'artist', 'agent'].includes(profile?.role ?? '')) {
    const NET_RATE = 0.864;
    const { data: myDists } = await admin
      .from('qr_config_targets')
      .select('distribution_ratio, qr_config_id')
      .eq('profile_id', user!.id)
      .is('deleted_at', null);

    if (myDists && myDists.length > 0) {
      const qrIds = myDists.map((d) => d.qr_config_id);
      const { data: txs } = await admin
        .from('transactions')
        .select('total_gross_amount, qr_config_id')
        .in('qr_config_id', qrIds)
        .eq('status', 'completed');

      for (const tx of txs ?? []) {
        const ratio = myDists
          .filter((d) => d.qr_config_id === tx.qr_config_id)
          .reduce((s, d) => s + Number(d.distribution_ratio ?? 0), 0);
        projectedNet += Math.floor((tx.total_gross_amount ?? 0) * NET_RATE * ratio);
      }
    }
  }

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

      {/* ホーム画面追加バナー */}
      <AddToHomeScreen />

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
            <p className="text-3xl font-black text-white italic tracking-tighter">{cheersHistory?.length ?? 0}</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-3">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
            <Zap size={20} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
              {['organizer', 'artist', 'agent'].includes(profile?.role ?? '') ? 'Projected Net' : 'Total Amount'}
            </p>
            <p className="text-3xl font-black text-white italic tracking-tighter">
              {['organizer', 'artist', 'agent'].includes(profile?.role ?? '')
                ? `¥${projectedNet.toLocaleString('ja-JP')}`
                : `¥${totalCheersAmount.toLocaleString('ja-JP')}`}
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-3">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
            <Wallet size={20} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Wallet Cards</p>
            <p className="text-3xl font-black text-white italic tracking-tighter">{cheersHistory?.length ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Cheers履歴 */}
      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
          <Heart size={14} className="text-pink-500" /> Cheers History
        </h2>
        {!cheersHistory || cheersHistory.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center space-y-3">
            <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">No cheers yet.</p>
            <p className="text-slate-700 text-xs">イベントでQRをスキャンして最初の応援を送ろう</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cheersHistory.map((tx: any) => (
              <div key={tx.transaction_id} className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-5 py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-white truncate">
                    {tx.qr_config?.event?.title ?? tx.product?.name ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {tx.product?.artist?.display_name && <span className="mr-2">{tx.product.artist.display_name}</span>}
                    {new Date(tx.created_at).toLocaleDateString('ja-JP')}
                  </p>
                  {tx.sender_comment && (
                    <p className="text-xs text-slate-400 mt-1 italic">"{tx.sender_comment}"</p>
                  )}
                </div>
                <p className="text-lg font-black text-pink-400 shrink-0 tabular-nums">
                  ¥{(tx.total_gross_amount ?? 0).toLocaleString('ja-JP')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* フォロー中 */}
      {follows.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <HeartHandshake size={14} className="text-pink-500" /> Following
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {follows.map((f: any) => (
              <div
                key={f.profile_id}
                className="bg-slate-900 border border-slate-800 rounded-[1.5rem] p-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {f.avatar_url ? (
                    <img
                      src={f.avatar_url}
                      alt={f.display_name}
                      className="w-10 h-10 rounded-2xl object-cover ring-2 ring-pink-500/20 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-600/30 to-pink-800/30 flex items-center justify-center ring-2 ring-pink-500/10 shrink-0">
                      <Mic2 size={16} className="text-pink-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{f.display_name}</p>
                    <p className="text-[10px] text-slate-500 capitalize">
                      {f.role === 'artist' ? 'アーティスト' : 'オーガナイザー'}
                    </p>
                  </div>
                </div>
                <FollowButton
                  followeeId={f.profile_id}
                  followeeName={f.display_name}
                  followeeRole={f.role}
                  size="sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* フォロワー数ヒーロー（artist / organizer のみ） */}
      {(profile?.role === 'artist' || profile?.role === 'organizer') && (
        <FollowerHero
          profileId={user!.id}
          displayName={profile.display_name ?? ''}
          role={profile.role as 'artist' | 'organizer'}
        />
      )}

      {/* アーティスト売上ダッシュボード */}
      {profile?.role === 'artist' && (
        <Suspense fallback={<div className="h-40 bg-slate-900 border border-slate-800 rounded-[2rem] animate-pulse" />}>
          <ArtistSalesDashboard profileId={user!.id} />
        </Suspense>
      )}

      {/* イベント */}
      {['organizer', 'agent', 'admin'].includes(profile?.role ?? '') && (
        <Link
          href="/dashboard/events"
          className="block bg-slate-900 border border-slate-800 hover:border-pink-500/40 rounded-[2rem] p-6 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-all">
              <Calendar size={22} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Events</p>
              <p className="text-white font-black text-lg italic uppercase tracking-tight group-hover:text-indigo-400 transition-colors">
                イベント管理
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* Admin/Agent: フォロワーインサイト */}
      {['admin', 'agent'].includes(profile?.role ?? '') && (
        <Link
          href="/admin/insights"
          className="block bg-slate-900 border border-slate-800 hover:border-violet-500/40 rounded-[2rem] p-6 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-violet-500/10 rounded-2xl flex items-center justify-center border border-violet-500/20 group-hover:bg-violet-500/20 transition-all">
              <TrendingUp size={22} className="text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Insights</p>
              <p className="text-white font-black text-lg italic uppercase tracking-tight group-hover:text-violet-400 transition-colors">
                フォロワー分析
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* Admin: 売上管理 */}
      {profile?.role === 'admin' && (
        <Link
          href="/admin/sales"
          className="block bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-[2rem] p-6 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-all">
              <BarChart2 size={22} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Admin</p>
              <p className="text-white font-black text-lg italic uppercase tracking-tight group-hover:text-emerald-400 transition-colors">
                売上管理
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* 招待リンク発行 */}
      {['admin', 'agent', 'organizer'].includes(profile?.role ?? '') && (
        <Link
          href="/dashboard/invitations"
          className="block bg-slate-900 border border-slate-800 hover:border-pink-500/40 rounded-[2rem] p-6 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-pink-500/10 rounded-2xl flex items-center justify-center border border-pink-500/20 group-hover:bg-pink-500/20 transition-all">
              <UserPlus size={22} className="text-pink-500" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Invitations</p>
              <p className="text-white font-black text-lg italic uppercase tracking-tight group-hover:text-pink-400 transition-colors">
                招待を送る
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* 出金管理（artist / organizer / agent） */}
      {['artist', 'organizer', 'agent'].includes(profile?.role ?? '') && (
        <Link
          href="/dashboard/payout"
          className="block bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-[2rem] p-6 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-all">
              <ArrowDownToLine size={22} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Payout</p>
              <p className="text-white font-black text-lg italic uppercase tracking-tight group-hover:text-emerald-400 transition-colors">
                出金管理
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* Admin: 精算管理 */}
      {profile?.role === 'admin' && (
        <Link
          href="/admin/settlements"
          className="block bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-[2rem] p-6 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 group-hover:bg-amber-500/20 transition-all">
              <ClipboardCheck size={22} className="text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Admin</p>
              <p className="text-white font-black text-lg italic uppercase tracking-tight group-hover:text-amber-400 transition-colors">
                精算管理
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* マイチケット */}
      <Link
        href="/tickets"
        className="block bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-[2rem] p-6 transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-all">
            <Ticket size={22} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Wallet</p>
            <p className="text-white font-black text-lg italic uppercase tracking-tight group-hover:text-indigo-400 transition-colors">
              マイチケット
            </p>
          </div>
        </div>
      </Link>

      {/* ロールアップグレード誘導 */}
      {profile?.role === 'user' && <RoleUpgradeBanner />}

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
