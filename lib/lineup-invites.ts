// 出演者に見せる出演依頼・出演予定。ダッシュボード（app/[locale]/dashboard/page.tsx）と
// チアリー(AI) の MCP ツールで共用する（ダッシュボードから切り出したまま）。
/* eslint-disable @typescript-eslint/no-explicit-any -- 埋め込み select の行をダッシュボードと同じ書き方で扱うため */
import type { SupabaseClient } from "@supabase/supabase-js";

export type LineupRow = {
  event_artist_id: string;
  event_id: string;
  status: string;
  invite_message: string | null;
  event: any;
};

export type LineupInvite = {
  event_artist_id: string;
  event_id: string;
  status: 'pending' | 'confirmed';
  invite_message?: string | null;
  event: { title: string; venue: string; start_at: string; organizer_profile_id: string; organizer_name: string } | null;
};

// admin は service_role。profileId の本人が出演者になっている行だけを読む
export function fetchLineupRows(admin: SupabaseClient, profileId: string) {
  return admin.from('event_artists').select(`
          event_artist_id, event_id, status, invite_message,
          event:events!event_id(
            title, venue, start_at, end_at, organizer_profile_id, deleted_at, lifecycle_status,
            organizer:profiles!organizer_profile_id(display_name)
          )
        `).eq('artist_profile_id', profileId).is('deleted_at', null).order('created_at', { ascending: false });
}

// now は ISO 文字列（出演予定の「終わっていない」判定に使う）
export async function visibleLineupInvites(admin: SupabaseClient, profileId: string, rows: LineupRow[], now: string): Promise<LineupInvite[]> {
  // 下書きのイベントで、まだ出演依頼の通知が来ていないもの（主催者側の「依頼予定」）は出演者に見せない
  const draftLineupEventIds = rows.filter((r) => r.status === 'pending' && r.event?.lifecycle_status === 'draft').map((r) => r.event_id as string);
  const invitedDraftEventIds = new Set<string>();
  if (draftLineupEventIds.length > 0) {
    const { data: invitedNotifs } = await admin.from('notifications').select('metadata')
      .eq('profile_id', profileId).eq('type', 'lineup_invite')
      .in('metadata->>event_id', draftLineupEventIds);
    for (const n of (invitedNotifs ?? []) as { metadata: any }[]) {
      if (n.metadata?.event_id) invitedDraftEventIds.add(n.metadata.event_id);
    }
  }

  return rows
        // event_artists.deleted_at は招待自体の削除フラグであり、紐づくイベントが
        // 削除(events.deleted_at)・中止(lifecycle_status='cancelled')されたかは別軸。
        // イベント削除・中止処理はevent_artists側を連動更新しないため、ここで
        // JOIN先イベントの状態を見て除外しないと「出演予定」に残り続けてしまう
        .filter((r) => !(r.event?.deleted_at || r.event?.lifecycle_status === 'cancelled'))
        .filter((r) => !(r.status === 'pending' && r.event?.lifecycle_status === 'draft' && !invitedDraftEventIds.has(r.event_id)))
        .filter((r) => r.status === 'pending' || (r.status === 'confirmed' && (!r.event?.end_at || r.event.end_at > now)))
        .map((r) => ({
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
