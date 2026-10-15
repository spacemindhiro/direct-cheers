import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// 代理作成した下書きは、担当エージェントが「主催者に確認を依頼する」（proxy-notify）を押すまで
// 主催者からは存在自体を見せない（一覧・イベント画面・承認依頼・編集など）。
// 「代理作成で未送信」の目印は、作成者宛ての通知行（type=proxy_event_draft）で持つ。
// 作成者の画面に通知一覧は無く、この type を表示する箇所も無い。送信時に削除する。
export const PROXY_DRAFT_MARKER = "proxy_event_draft";

export async function markProxyDraft(admin: AdminClient, opts: { eventId: string; creatorId: string; organizerId: string }) {
  const { error } = await admin.from("notifications").insert({
    profile_id: opts.creatorId,
    type: PROXY_DRAFT_MARKER,
    title: "代理作成の下書き（主催者に未送信）",
    body: "",
    is_read: true,
    metadata: { event_id: opts.eventId, organizer_id: opts.organizerId },
  });
  if (error) throw new Error(error.message);
}

export async function clearProxyDraftMarker(admin: AdminClient, eventId: string) {
  await admin.from("notifications").delete()
    .eq("type", PROXY_DRAFT_MARKER)
    .filter("metadata->>event_id", "eq", eventId);
}

// この主催者からまだ隠している（代理作成・未送信の）イベントID
export async function hiddenProxyDraftIds(admin: AdminClient, organizerId: string): Promise<string[]> {
  const { data } = await admin.from("notifications").select("metadata")
    .eq("type", PROXY_DRAFT_MARKER)
    .filter("metadata->>organizer_id", "eq", organizerId);
  return ((data ?? []) as { metadata: any }[]).map((n) => n.metadata?.event_id).filter(Boolean);
}

// このユーザー（主催者）から隠しているイベントか
export async function isProxyDraftHiddenFrom(admin: AdminClient, eventId: string, userId: string): Promise<boolean> {
  const { count } = await admin.from("notifications").select("notification_id", { count: "exact", head: true })
    .eq("type", PROXY_DRAFT_MARKER)
    .filter("metadata->>event_id", "eq", eventId)
    .filter("metadata->>organizer_id", "eq", userId);
  return (count ?? 0) > 0;
}
