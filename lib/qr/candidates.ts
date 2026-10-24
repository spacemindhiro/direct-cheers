// QR の宛先・配分先の候補（作成画面とチアリー(AI) の確認カードで共用）。
// 主催者本人（主催者名義）＋そのイベントの出演者で断っていない人（アーティスト名義）。作成 API の判定（lib/qr/rules.ts の qrPeople）と同じ範囲。
// 宛先の表示名・画像は名義（organizer_name/artist_name、organizer_avatar_url/artist_avatar_url）優先で、無ければ基本の表示名・画像。
// 同一人物がオーガナイザー兼演者の場合、profile_id は同じだが role が異なる2行になる
// （recipient_name_context で名義を区別して保存するため、別候補として扱う）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { avatarFields } from "@/lib/image-source";

export type QrCandidate = {
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_original_url: string | null;
  role: "organizer" | "artist";
  status: string;
};

export type QrCandidateEvent = {
  event_id: string;
  title: string;
  lifecycle_status: string;
  start_at: string | null;
  end_at: string | null;
  venue: string | null;
  base_flyer_url: string | null;
  organizer_profile_id: string;
  targets: QrCandidate[];
};

/* eslint-disable @typescript-eslint/no-explicit-any -- 埋め込みの select の型を書かないため */
export async function qrCandidateEvent(admin: SupabaseClient, eventId: string): Promise<QrCandidateEvent | null> {
  const { data: event } = await admin
    .from("events")
    .select(`
      event_id, title, lifecycle_status, start_at, end_at, venue, base_flyer_url,
      organizer_profile_id,
      organizer:profiles!organizer_profile_id(display_name, organizer_name, organizer_avatar_url, avatar_url, organizer_avatar_original_url, avatar_original_url),
      event_artists(artist_profile_id, status, deleted_at, artist:profiles!artist_profile_id(display_name, artist_name, artist_avatar_url, avatar_url, artist_avatar_original_url, avatar_original_url))
    `)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!event) return null;
  const org = event.organizer as any;
  const targets: QrCandidate[] = [
    {
      profile_id: event.organizer_profile_id,
      display_name: org?.organizer_name ?? org?.display_name ?? "オーガナイザー",
      ...avatarFields(
        { url: org?.organizer_avatar_url, originalUrl: org?.organizer_avatar_original_url },
        { url: org?.avatar_url, originalUrl: org?.avatar_original_url },
      ),
      role: "organizer",
      status: "confirmed",
    },
    ...((event.event_artists ?? []) as any[])
      .filter((ea) => ea.status !== "rejected" && ea.deleted_at === null)
      .map((ea) => ({
        profile_id: ea.artist_profile_id as string,
        display_name: ea.artist?.artist_name ?? ea.artist?.display_name ?? "—",
        ...avatarFields(
          { url: ea.artist?.artist_avatar_url, originalUrl: ea.artist?.artist_avatar_original_url },
          { url: ea.artist?.avatar_url, originalUrl: ea.artist?.avatar_original_url },
        ),
        role: "artist" as const,
        status: ea.status as string,
      })),
  ];
  return {
    event_id: event.event_id,
    title: event.title,
    lifecycle_status: event.lifecycle_status,
    start_at: event.start_at ?? null,
    end_at: event.end_at ?? null,
    venue: event.venue ?? null,
    base_flyer_url: event.base_flyer_url ?? null,
    organizer_profile_id: event.organizer_profile_id,
    targets,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
