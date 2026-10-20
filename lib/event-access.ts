// 「このイベントを誰が見られるか・操作できるか」の判定の集約先。
// イベント配下の画面・API はデータを読むときに必ずここを通す（レイアウトの判定は画面遷移で再実行されないことがあるため、
// 各画面がデータを読む場所で判定する。Next.js 公式：Layouts and auth checks）。
//
// 2026-10-21 本番の不具合：イベント詳細・QR詳細に関係者の判定が無く、ログインしていれば誰でも他人のイベント
// （下書きを含む）を開けた。オーガナイズグループ（共同主催）を入れるときは、ここに「イベントのグループのメンバー」を足す。
import type { createAdminClient } from "@/lib/supabase/admin";
import { isProxyDraftHiddenFrom } from "@/lib/proxy-draft";
import { canOperateEvent } from "@/lib/event-operator";

type AdminClient = ReturnType<typeof createAdminClient>;

export type EventAccess = {
  isAdmin: boolean;
  isOrganizer: boolean;     // 主催者（代理作成で未送信の下書きは false）
  isAgent: boolean;         // このイベントのエージェント
  isLineupArtist: boolean;  // 出演者（辞退・依頼予定を除く）
  canView: boolean;         // イベント配下の画面を見られる
  canOperate: boolean;      // 現場操作・QR作成など（主催者・エージェント・admin。canOperateEvent と同じ）
};

// イベントが存在しなければ null
export async function getEventAccess(
  admin: AdminClient,
  eventId: string,
  userId: string,
  role: string | null | undefined,
): Promise<EventAccess | null> {
  const { data: event } = await admin
    .from("events")
    .select("organizer_profile_id, agent_id, lifecycle_status, event_artists(artist_profile_id, status, deleted_at)")
    .eq("event_id", eventId)
    .maybeSingle();
  if (!event) return null;

  const isAdmin = role === "admin";
  // 代理作成でまだ主催者に送っていない下書きは、主催者からは存在しない扱い
  const hiddenFromMe = await isProxyDraftHiddenFrom(admin, eventId, userId);
  const isOrganizer = event.organizer_profile_id === userId && !hiddenFromMe;
  const isAgent = event.agent_id === userId;

  // 出演者：辞退していない。下書きの間に選ばれただけで出演依頼がまだ届いていない「依頼予定」は除く
  // （ダッシュボードの出演依頼と同じ見せ方 lib/lineup-invites.ts）
  const mine = ((event.event_artists ?? []) as { artist_profile_id: string; status: string; deleted_at: string | null }[])
    .find((ea) => ea.artist_profile_id === userId && ea.deleted_at === null && ea.status !== "rejected");
  let isLineupArtist = !!mine;
  if (mine && mine.status === "pending" && event.lifecycle_status === "draft") {
    const { count } = await admin.from("notifications").select("notification_id", { count: "exact", head: true })
      .eq("profile_id", userId).eq("type", "lineup_invite").filter("metadata->>event_id", "eq", eventId);
    isLineupArtist = (count ?? 0) > 0;
  }

  const canOperate = !hiddenFromMe && await canOperateEvent(admin, userId, role, eventId);
  return {
    isAdmin,
    isOrganizer,
    isAgent,
    isLineupArtist,
    canView: isAdmin || isOrganizer || isAgent || isLineupArtist,
    canOperate,
  };
}
