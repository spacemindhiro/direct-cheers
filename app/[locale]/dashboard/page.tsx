import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Zap, Heart, Loader2, UserPlus, Calendar, BarChart2, ArrowDownToLine, ClipboardCheck, Mic2, HeartHandshake, TrendingUp, Ticket, Layers } from 'lucide-react';
import { getFeeConfig } from '@/lib/fee-config';
import Link from 'next/link';
import { AddToHomeScreen } from '@/components/add-to-homescreen';
import { ArtistSalesDashboard } from '@/components/artist-sales-dashboard';
import { LineupInvitations } from '@/components/lineup-invitations';
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

  // Cheers履歴: sender_profile_id または sender_email でマッチ
  const userEmail = user!.email!;

  const { data: byProfile } = await admin
    .from('transactions')
    .select(`
      transaction_id, total_gross_amount, created_at, sender_comment, sender_name, sender_email,
      product:products!product_id(name, artist_id, artist:profiles!artist_id(display_name)),
      qr_config:qr_configs!qr_config_id(event_id, event:events!event_id(title))
    `)
    .eq('sender_profile_id', user!.id)
    .eq('status', 'completed')
    .neq('transaction_type', 'invitation')
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: byEmail } = await admin
    .from('transactions')
    .select(`
      transaction_id, total_gross_amount, created_at, sender_comment, sender_name, sender_email,
      product:products!product_id(name, artist_id, artist:profiles!artist_id(display_name)),
      qr_config:qr_configs!qr_config_id(event_id, event:events!event_id(title))
    `)
    .eq('sender_email', userEmail)
    .eq('status', 'completed')
    .neq('transaction_type', 'invitation')
    .order('created_at', { ascending: false })
    .limit(50);

  // 重複排除してマージ
  const seen = new Set<string>();
  let cheersHistory: any[] = [];
  for (const tx of [...(byProfile ?? []), ...(byEmail ?? [])]) {
    if (!seen.has(tx.transaction_id)) {
      seen.add(tx.transaction_id);
      cheersHistory.push(tx);
    }
  }
  cheersHistory.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  cheersHistory = cheersHistory.slice(0, 20);

  const totalCheersAmount = (cheersHistory ?? []).reduce((s, t) => s + (t.total_gross_amount ?? 0), 0);

  // オーガナイザー / アーティスト / エージェント向け: 自分が関わるイベントの累計着金予測
  let projectedNet = 0;
  const feeConfig = await getFeeConfig();

  if (profile?.role === 'agent') {
    // エージェントは distribution_configs.agent_fee_rate × (gross - stripe_fee) で計算
    // webhookが先行した場合 transaction_distributions に行が存在しないケースがあるため直接計算
    const { data: agentEvents } = await admin
      .from('events')
      .select('event_id')
      .eq('agent_id', user!.id)
      .is('deleted_at', null);

    if (agentEvents && agentEvents.length > 0) {
      const eventIds = agentEvents.map((e) => e.event_id);

      const [{ data: distConfigs }, { data: qrConfigs }] = await Promise.all([
        admin.from('distribution_configs').select('event_id, agent_fee_rate').in('event_id', eventIds),
        admin.from('qr_configs').select('qr_config_id, event_id').in('event_id', eventIds).is('deleted_at', null),
      ]);

      const agentFeeRateMap = new Map((distConfigs ?? []).map((d) => [d.event_id, Number(d.agent_fee_rate)]));
      const qrToEventMap = new Map((qrConfigs ?? []).map((q) => [q.qr_config_id, q.event_id]));
      const qrIds = (qrConfigs ?? []).map((q) => q.qr_config_id);

      if (qrIds.length > 0) {
        const { data: txs } = await admin
          .from('transactions')
          .select('total_gross_amount, qr_config_id, payment_method')
          .in('qr_config_id', qrIds)
          .eq('status', 'completed');

        for (const tx of txs ?? []) {
          const eventId = qrToEventMap.get(tx.qr_config_id);
          const agentFeeRate = eventId ? (agentFeeRateMap.get(eventId) ?? feeConfig.agent_fee_rate) : feeConfig.agent_fee_rate;
          const gross = tx.total_gross_amount ?? 0;
          const stripeFee = tx.payment_method === 'paypay'
            ? Math.floor(gross * feeConfig.paypay_rate)
            : Math.floor(gross * feeConfig.stripe_rate);
          projectedNet += Math.floor((gross - stripeFee) * agentFeeRate);
        }
      }
    }
  } else if (['organizer', 'artist'].includes(profile?.role ?? '')) {
    const { data: myDists } = await admin
      .from('qr_config_targets')
      .select('distribution_ratio, qr_config_id')
      .eq('profile_id', user!.id)
      .is('deleted_at', null);

    if (myDists && myDists.length > 0) {
      const qrIds = myDists.map((d) => d.qr_config_id);
      const { data: txs } = await admin
        .from('transactions')
        .select('total_gross_amount, qr_config_id, payment_method')
        .in('qr_config_id', qrIds)
        .eq('status', 'completed');

      for (const tx of txs ?? []) {
        const ratio = myDists
          .filter((d) => d.qr_config_id === tx.qr_config_id)
          .reduce((s, d) => s + Number(d.distribution_ratio ?? 0), 0);
        const gross = tx.total_gross_amount ?? 0;
        const stripeFee = tx.payment_method === 'paypay'
          ? Math.floor(gross * feeConfig.paypay_rate)
          : Math.floor(gross * feeConfig.stripe_rate);
        const platformFee = Math.floor(gross * feeConfig.platform_rate);
        projectedNet += Math.floor((gross - stripeFee - platformFee) * ratio);
      }
    }
  }

  // オーガナイザー向け: 未読のイベント承認/中止通知
  let pendingNotifications: { notification_id: string; title: string; body: string; metadata: any }[] = [];
  let evidenceRejectedNotifications: { notification_id: string; title: string; body: string; metadata: any }[] = [];
  if (['organizer', 'admin'].includes(profile?.role ?? '')) {
    const { data: notifs } = await admin
      .from('notifications')
      .select('notification_id, title, body, metadata')
      .eq('profile_id', user!.id)
      .in('type', ['event_approved', 'event_cancelled', 'event_cancel_rejected'])
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(5);
    pendingNotifications = notifs ?? [];

    const { data: rejectedNotifs } = await admin
      .from('notifications')
      .select('notification_id, title, body, metadata')
      .eq('profile_id', user!.id)
      .eq('type', 'evidence_rejected')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(20);

    // 差戻し状態が解消済み（再提出・精算完了）のイベントの通知を除外
    const rejectedEventIds = (rejectedNotifs ?? [])
      .map((n) => n.metadata?.event_id)
      .filter(Boolean) as string[];

    let stillRejectedEventIds = new Set<string>();
    if (rejectedEventIds.length > 0) {
      const { data: activeSummaries } = await admin
        .from('settlement_summaries')
        .select('event_id')
        .in('event_id', rejectedEventIds)
        .eq('is_approved_for_payout', false);
      stillRejectedEventIds = new Set((activeSummaries ?? []).map((s) => s.event_id));
    }

    const seenRejected = new Set<string>();
    evidenceRejectedNotifications = (rejectedNotifs ?? []).filter((n) => {
      const eid = n.metadata?.event_id;
      if (!eid || !stillRejectedEventIds.has(eid) || seenRejected.has(eid)) return false;
      seenRejected.add(eid);
      return true;
    });
  }

  // admin向け: 口座開設審査待ち件数 + 証跡提出通知
  let pendingConnectReviewCount = 0;
  let pendingEvidenceNotifications: { notification_id: string; title: string; body: string; metadata: any }[] = [];
  if (profile?.role === 'admin') {
    const { count } = await admin
      .from('profiles')
      .select('profile_id', { count: 'exact', head: true })
      .eq('verification_status', 'pending');
    pendingConnectReviewCount = count ?? 0;

    const { data: evidenceNotifs } = await admin
      .from('notifications')
      .select('notification_id, title, body, metadata')
      .eq('profile_id', user!.id)
      .eq('type', 'evidence_submitted')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(50);
    // 精算済みイベントの通知を除外 + event_id単位で最新1件のみ
    const evidenceEventIds = (evidenceNotifs ?? [])
      .map((n) => n.metadata?.event_id)
      .filter(Boolean) as string[];

    let settledEventIds = new Set<string>();
    if (evidenceEventIds.length > 0) {
      const { data: settledEvents } = await admin
        .from('events')
        .select('event_id')
        .in('event_id', evidenceEventIds)
        .eq('lifecycle_status', 'settled');
      settledEventIds = new Set((settledEvents ?? []).map((e) => e.event_id));
    }

    const seenEventIds = new Set<string>();
    pendingEvidenceNotifications = (evidenceNotifs ?? []).filter((n) => {
      const eid = n.metadata?.event_id;
      if (!eid || settledEventIds.has(eid) || seenEventIds.has(eid)) return false;
      seenEventIds.add(eid);
      return true;
    });
  }

  // エージェント向け: 承認依頼通知
  let approvalRequestedNotifications: { notification_id: string; title: string; body: string; metadata: any }[] = [];
  if (['agent', 'admin'].includes(profile?.role ?? '')) {
    const { data: approvalNotifs } = await admin
      .from('notifications')
      .select('notification_id, title, body, metadata')
      .eq('profile_id', user!.id)
      .eq('type', 'approval_requested')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(10);

    // review_requested のままのイベントの通知のみ表示（承認済み・却下済みは除外）
    const notifEventIds = (approvalNotifs ?? [])
      .map((n) => n.metadata?.event_id)
      .filter(Boolean) as string[];

    let pendingEventIds = new Set<string>();
    if (notifEventIds.length > 0) {
      const { data: pendingEvents } = await admin
        .from('events')
        .select('event_id')
        .in('event_id', notifEventIds)
        .eq('lifecycle_status', 'review_requested');
      pendingEventIds = new Set((pendingEvents ?? []).map((e) => e.event_id));
    }

    const seenApproval = new Set<string>();
    approvalRequestedNotifications = (approvalNotifs ?? []).filter((n) => {
      const eid = n.metadata?.event_id;
      if (!eid || !pendingEventIds.has(eid) || seenApproval.has(eid)) return false;
      seenApproval.add(eid);
      return true;
    });
  }

  // エージェント向け: 承認待ちイベント件数
  let pendingApprovalCount = 0;
  let pendingCancellationCount = 0;
  if (['agent', 'admin'].includes(profile?.role ?? '')) {
    const query = admin.from('events').select('event_id', { count: 'exact', head: true });
    const baseQuery = profile?.role === 'agent'
      ? query.eq('agent_id', user!.id)
      : query;

    const { count: draftCount } = await baseQuery.eq('lifecycle_status', 'review_requested');
    const { count: cancelCount } = await (profile?.role === 'agent'
      ? admin.from('events').select('event_id', { count: 'exact', head: true }).eq('agent_id', user!.id)
      : admin.from('events').select('event_id', { count: 'exact', head: true })
    ).eq('lifecycle_status', 'cancellation_requested');

    pendingApprovalCount = draftCount ?? 0;
    pendingCancellationCount = cancelCount ?? 0;
  }

  // アーティスト向け: 出演依頼（pending）と出演予定（confirmed）を取得
  let lineupInvites: {
    event_artist_id: string;
    event_id: string;
    status: "pending" | "confirmed";
    invite_message?: string | null;
    event: { title: string; venue: string; start_at: string; organizer_profile_id: string; organizer_name: string } | null;
  }[] = [];

  if (profile?.role === 'artist') {
    const { data: allRows } = await admin
      .from('event_artists')
      .select(`
        event_artist_id, event_id, status, invite_message,
        event:events!event_id(
          title, venue, start_at, end_at, organizer_profile_id,
          organizer:profiles!organizer_profile_id(display_name)
        )
      `)
      .eq('artist_profile_id', user!.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const now = new Date().toISOString();
    lineupInvites = (allRows ?? [])
      .filter((r: any) => r.status === 'pending' || (r.status === 'confirmed' && (!r.event?.end_at || r.event.end_at > now)))
      .map((r: any) => ({
        event_artist_id: r.event_artist_id,
        event_id: r.event_id,
        status: r.status as 'pending' | 'confirmed',
        invite_message: r.invite_message ?? null,
        event: r.event
          ? {
              title: r.event.title,
              venue: r.event.venue,
              start_at: r.event.start_at,
              organizer_profile_id: r.event.organizer_profile_id,
              organizer_name: r.event.organizer?.display_name ?? 'オーガナイザー',
            }
          : null,
      }));
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
      <Suspense fallback={null}>
        <AddToHomeScreen />
      </Suspense>

      {/* エージェント向け: 承認依頼通知バナー */}
      {approvalRequestedNotifications.length > 0 && (
        <div className="space-y-2">
          {approvalRequestedNotifications.map((n) => (
            <Link
              key={n.notification_id}
              href={n.metadata?.event_id ? `/dashboard/events/${n.metadata.event_id}` : '/dashboard/events'}
              className="flex items-start justify-between gap-4 bg-amber-500/10 border border-amber-500/30 hover:border-amber-500/60 rounded-[1.5rem] px-5 py-4 transition-all"
            >
              <div className="space-y-0.5">
                <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">承認依頼</p>
                <p className="text-sm font-black text-white">{n.title}</p>
                <p className="text-xs text-slate-400">{n.body}</p>
              </div>
              <span className="text-amber-400 text-xs font-black uppercase tracking-widest shrink-0 mt-1">確認 →</span>
            </Link>
          ))}
        </div>
      )}

      {/* オーガナイザー向け: エビデンス差戻し通知バナー */}
      {evidenceRejectedNotifications.length > 0 && (
        <div className="space-y-2">
          {evidenceRejectedNotifications.map((n) => (
            <Link
              key={n.notification_id}
              href={n.metadata?.event_id ? `/dashboard/events/${n.metadata.event_id}/evidence` : '/dashboard/events'}
              className="flex items-start justify-between gap-4 bg-red-500/10 border border-red-500/30 hover:border-red-500/60 rounded-[1.5rem] px-5 py-4 transition-all"
            >
              <div className="space-y-0.5">
                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">エビデンス差戻し</p>
                <p className="text-sm font-black text-white">{n.title}</p>
                <p className="text-xs text-slate-400 whitespace-pre-line">{n.body}</p>
              </div>
              <span className="text-red-400 text-xs font-black uppercase tracking-widest shrink-0 mt-1">再提出 →</span>
            </Link>
          ))}
        </div>
      )}

      {/* オーガナイザー向け: イベント承認/中止通知バナー */}
      {pendingNotifications.length > 0 && (
        <div className="space-y-2">
          {pendingNotifications.map((n) => (
            <Link
              key={n.notification_id}
              href={n.metadata?.event_id ? `/dashboard/events/${n.metadata.event_id}` : '/dashboard/events'}
              className="flex items-start justify-between gap-4 bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500/60 rounded-[1.5rem] px-5 py-4 transition-all"
            >
              <div className="space-y-0.5">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">お知らせ</p>
                <p className="text-sm font-black text-white">{n.title}</p>
                <p className="text-xs text-slate-400">{n.body}</p>
              </div>
              <span className="text-emerald-400 text-xs font-black uppercase tracking-widest shrink-0 mt-1">確認 →</span>
            </Link>
          ))}
        </div>
      )}

      {/* admin向け: 口座開設審査待ちバナー */}
      {pendingConnectReviewCount > 0 && (
        <Link
          href="/dashboard/admin/connect-review"
          className="block bg-indigo-500/10 border border-indigo-500/30 hover:border-indigo-500/60 rounded-[1.5rem] px-5 py-4 transition-all"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">口座開設審査待ち</p>
              <p className="text-sm font-black text-white">審査待ち {pendingConnectReviewCount}件</p>
            </div>
            <span className="text-indigo-400 text-xs font-black uppercase tracking-widest shrink-0">審査する →</span>
          </div>
        </Link>
      )}

      {/* admin向け: 証跡提出通知バナー */}
      {pendingEvidenceNotifications.length > 0 && (
        <div className="space-y-2">
          {pendingEvidenceNotifications.map((n) => (
            <Link
              key={n.notification_id}
              href="/admin/settlements"
              className="block bg-amber-500/10 border border-amber-500/30 hover:border-amber-500/60 rounded-[1.5rem] px-5 py-4 transition-all"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">証跡提出 — 精算承認待ち</p>
                  <p className="text-sm font-black text-white">{n.body}</p>
                </div>
                <span className="text-amber-400 text-xs font-black uppercase tracking-widest shrink-0">確認する →</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* エージェント向け: 承認待ちバナー */}
      {(pendingApprovalCount > 0 || pendingCancellationCount > 0) && (
        <Link
          href="/dashboard/events"
          className="block bg-amber-500/10 border border-amber-500/30 hover:border-amber-500/60 rounded-[1.5rem] px-5 py-4 transition-all"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">要対応</p>
              <p className="text-sm font-black text-white">
                {[
                  pendingApprovalCount > 0 && `承認待ち ${pendingApprovalCount}件`,
                  pendingCancellationCount > 0 && `中止申請 ${pendingCancellationCount}件`,
                ].filter(Boolean).join('　／　')}
              </p>
            </div>
            <span className="text-amber-400 text-xs font-black uppercase tracking-widest shrink-0">確認 →</span>
          </div>
        </Link>
      )}

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

      {/* 受け取り金額セクション（artist / organizer / agent のみ） */}
      {['organizer', 'artist', 'agent'].includes(profile?.role ?? '') && (
        <div className="space-y-3">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <Zap size={14} className="text-emerald-400" /> 受け取り金額
          </h2>
          <Link
            href="/dashboard/payout"
            className="block bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-[2rem] p-6 transition-all group"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Projected Net（着金予測）</p>
                <p className="text-4xl font-black text-emerald-400 italic tracking-tighter">
                  ¥{projectedNet.toLocaleString('ja-JP')}
                </p>
              </div>
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-all shrink-0">
                <Zap size={22} className="text-emerald-400" />
              </div>
            </div>
            <p className="text-[10px] text-slate-600 mt-3">タップして出金管理へ →</p>
          </Link>
        </div>
      )}

      {/* Cheers送信セクション */}
      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
          <Heart size={14} className="text-pink-500" /> 送ったチア
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-5 space-y-2">
            <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center border border-pink-500/20">
              <Heart size={18} className="text-pink-500" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Total Cheers</p>
              <p className="text-3xl font-black text-white italic tracking-tighter">{cheersHistory?.length ?? 0}</p>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-5 space-y-2">
            <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center border border-pink-500/20">
              <TrendingUp size={18} className="text-pink-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Total Amount</p>
              <p className="text-3xl font-black text-white italic tracking-tighter">
                ¥{totalCheersAmount.toLocaleString('ja-JP')}
              </p>
            </div>
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

      {/* コレクションリンク */}
      {cheersHistory.length > 0 && (
        <Link
          href="/dashboard/collection"
          className="block bg-slate-900 border border-slate-800 hover:border-pink-500/40 rounded-[2rem] p-6 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-pink-500/10 rounded-2xl flex items-center justify-center border border-pink-500/20 group-hover:bg-pink-500/20 transition-all">
              <Layers size={22} className="text-pink-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Collection</p>
              <p className="text-white font-black text-lg italic uppercase tracking-tight group-hover:text-pink-400 transition-colors">
                カードコレクション
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Cheersカードをすべて眺める</p>
            </div>
          </div>
        </Link>
      )}

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
        <FollowerHero profileId={user!.id} />
      )}

      {/* アーティスト向け: 出演依頼（pending） */}
      {profile?.role === 'artist' && lineupInvites.length > 0 && (
        <LineupInvitations invites={lineupInvites} artistId={user!.id} />
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

      {/* Admin: 精算管理 + 照合管理 */}
      {profile?.role === 'admin' && (
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/admin/settlements"
            className="block bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-[2rem] p-6 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 group-hover:bg-amber-500/20 transition-all shrink-0">
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
          <Link
            href="/admin/reconcile"
            className="block bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-[2rem] p-6 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-all shrink-0">
                <BarChart2 size={22} className="text-indigo-400" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Admin</p>
                <p className="text-white font-black text-lg italic uppercase tracking-tight group-hover:text-indigo-400 transition-colors">
                  照合管理
                </p>
              </div>
            </div>
          </Link>
        </div>
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
