import type { SupabaseClient } from "@supabase/supabase-js";

// 照会画面（/dashboard/directory）のコアロジック。
// 照会される側は登録手続き（Stripe口座開設・規約同意・面談）の途中でも検索・照会できる。
// 口座開設が終わっていないだけで見えなくなると業務上困るため、status では絞らない。
// 閲覧者のロールで「検索できる相手」と「見える項目」を出し分ける。
//   organizer : アーティストのみ検索可。公開プロフィール項目のみ
//   agent/admin: アーティスト・オーガナイザーとも検索可。実績・口座状況も見える
// 一般ユーザー(user)・artist には開放しない。

export type DirectoryType = "artist" | "organizer";

export const DIRECTORY_VIEWER_ROLES = ["organizer", "agent", "admin"] as const;
const INTERNAL_VIEWER_ROLES = ["agent", "admin"];

// 上位互換：アーティスト業務はorganizer/agentも行うため検索対象に含める。
// adminは出演・主催しないため対象外（/api/artists/search と同じ考え方）
const TARGET_ROLES: Record<DirectoryType, string[]> = {
  artist: ["artist", "organizer", "agent"],
  organizer: ["organizer", "agent"],
};

// 実績として数えるイベント状態（下書き・審査中・中止系は含めない）
export const ACHIEVED_LIFECYCLES = ["published", "ongoing", "ended", "settled"];

export function canViewDirectory(role: string | null | undefined): boolean {
  return !!role && (DIRECTORY_VIEWER_ROLES as readonly string[]).includes(role);
}

// dashboard layout と同じ有効期限（stepup-verify の cookie maxAge とも一致）
const STEP_UP_TTL_MS = 1440 * 60 * 1000;

export function isStepUpFresh(cookieValue: string | undefined, now = Date.now()): boolean {
  if (!cookieValue || !/^\d+$/.test(cookieValue)) return false;
  const at = parseInt(cookieValue, 10);
  return at <= now && now - at < STEP_UP_TTL_MS;
}

/**
 * 照会画面の閲覧者判定。ページとAPIで必ずこれを通す。
 * 判定はロールのみ。登録手続きの進捗（status＝口座開設等）は利用可否に関係しない。
 */
export async function resolveDirectoryViewer(
  admin: SupabaseClient,
  userId: string,
): Promise<{ role: string } | null> {
  const { data: me } = await admin
    .from("profiles")
    .select("role")
    .eq("profile_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!me || !canViewDirectory(me.role)) return null;
  return { role: me.role };
}

export function isInternalViewer(role: string | null | undefined): boolean {
  return !!role && INTERNAL_VIEWER_ROLES.includes(role);
}

export function allowedTypes(role: string | null | undefined): DirectoryType[] {
  if (isInternalViewer(role)) return ["artist", "organizer"];
  if (canViewDirectory(role)) return ["artist"];
  return [];
}

// 照会してよい相手のロール（検索対象ロールの和集合）
function viewableTargetRoles(viewerRole: string): string[] {
  return [...new Set(allowedTypes(viewerRole).flatMap((t) => TARGET_ROLES[t]))];
}

// カンマ・括弧は PostgREST の or() 構文を壊すため除去。% _ \ は ILIKE の特殊文字としてエスケープ
export function toIlikePattern(raw: string): string | null {
  const q = raw.replace(/[,()]/g, "").trim();
  if (q.length < 1) return null;
  return `%${q.replace(/\\/g, "\\\\").replace(/[%_]/g, (c) => `\\${c}`)}%`;
}

const PUBLIC_COLUMNS =
  "profile_id, role, display_name, avatar_url, artist_name, artist_avatar_url, organizer_name, organizer_avatar_url, organization_name, genre, affiliation, bio, social_links";

type ProfileRow = {
  profile_id: string;
  role: string;
  display_name: string;
  avatar_url: string | null;
  artist_name: string | null;
  artist_avatar_url: string | null;
  organizer_name: string | null;
  organizer_avatar_url: string | null;
  organization_name: string | null;
  genre: string | null;
  affiliation: string | null;
  bio: string | null;
  social_links: { instagram?: string; soundcloud?: string; website?: string } | null;
};

function nameFor(p: ProfileRow, type: DirectoryType): string {
  return (type === "artist" ? p.artist_name : p.organizer_name) || p.display_name;
}

function avatarFor(p: ProfileRow, type: DirectoryType): string | null {
  return (type === "artist" ? p.artist_avatar_url : p.organizer_avatar_url) || p.avatar_url;
}

export type DirectorySearchItem = {
  profile_id: string;
  role: string;
  name: string;
  avatar_url: string | null;
  // artist: ジャンル / organizer: 団体名（両方に該当したら「ジャンル / 団体名」）
  sub: string | null;
  // どの種別の検索に該当したか（両方オンで同一人物が両方に該当したら両方入る）
  matched: DirectoryType[];
};

const SEARCH_LIMIT = 50;

// 種別の正規化（重複除去・表示順をartist→organizerに固定）。不明な値は残し、権限判定で弾かせる
export function parseTypes(raw: string | null): string[] {
  const list = (raw ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return [...new Set(list)].sort((a, b) => (a === "artist" ? -1 : b === "artist" ? 1 : 0));
}

export async function searchDirectory(
  admin: SupabaseClient,
  params: { viewerId: string; types: DirectoryType[]; q: string },
): Promise<DirectorySearchItem[]> {
  const pattern = toIlikePattern(params.q);
  if (!pattern || params.types.length === 0) return [];

  const searchOne = async (type: DirectoryType) => {
    const searchColumns = type === "artist"
      ? ["display_name", "artist_name"]
      : ["display_name", "organizer_name", "organization_name"];
    const { data, error } = await admin
      .from("profiles")
      .select(`${PUBLIC_COLUMNS}, created_at`)
      .in("role", TARGET_ROLES[type])
      .is("deleted_at", null)
      .neq("profile_id", params.viewerId)
      .or(searchColumns.map((c) => `${c}.ilike.${pattern}`).join(","))
      .order("created_at", { ascending: false })
      .limit(SEARCH_LIMIT);
    if (error) throw new Error(error.message);
    return (data ?? []) as (ProfileRow & { created_at: string })[];
  };

  const perType = await Promise.all(params.types.map(async (t) => ({ type: t, rows: await searchOne(t) })));

  // 同一人物は1件にまとめる。名前・アバター・サブ表記は先に該当した種別（artist優先）のものを使う
  const merged = new Map<string, DirectorySearchItem>();
  const createdAt = new Map<string, string>();
  for (const { type, rows } of perType) {
    for (const p of rows) {
      const sub = type === "artist" ? p.genre : p.organization_name;
      const hit = merged.get(p.profile_id);
      if (hit) {
        // 両方に該当した人はサブ表記を「ジャンル / 団体名」と並べ、主催側の情報も見えるようにする
        hit.matched.push(type);
        hit.sub = [hit.sub, sub].filter(Boolean).join(" / ") || null;
        continue;
      }
      merged.set(p.profile_id, {
        profile_id: p.profile_id,
        role: p.role,
        name: nameFor(p, type),
        avatar_url: avatarFor(p, type),
        sub,
        matched: [type],
      });
      createdAt.set(p.profile_id, p.created_at);
    }
  }

  return [...merged.values()]
    .sort((a, b) => createdAt.get(b.profile_id)!.localeCompare(createdAt.get(a.profile_id)!))
    .slice(0, SEARCH_LIMIT);
}

export type DirectoryEvent = {
  event_id: string;
  title: string;
  start_at: string;
  lifecycle_status: string;
};

export type DirectoryProfile = {
  profile_id: string;
  role: string;
  display_name: string;
  artist_name: string | null;
  organizer_name: string | null;
  avatar_url: string | null;
  organization_name: string | null;
  genre: string | null;
  affiliation: string | null;
  bio: string | null;
  social_links: { instagram?: string; soundcloud?: string; website?: string };
  // agent/admin のみ。organizer には null で返し、値自体をクライアントに渡さない
  internal: {
    // 登録手続きの進み具合（pending_onboarding→pending_terms→pending_interview→active）
    registration_status: string;
    account: {
      has_connect_account: boolean;
      verification_status: string;
      stripe_restricted: boolean;
      balance_frozen: boolean;
      chargeback_count: number;
    };
    performances: DirectoryEvent[];
    hosted_events: DirectoryEvent[];
  } | null;
};

const EVENT_LIMIT = 100;

// 本人入力のURLを他人の画面でリンクにするため、http(s)以外（javascript: 等）は落とす
export function safeSocialLinks(
  links: ProfileRow["social_links"],
): DirectoryProfile["social_links"] {
  const out: DirectoryProfile["social_links"] = {};
  for (const key of ["instagram", "soundcloud", "website"] as const) {
    const v = links?.[key]?.trim();
    if (!v) continue;
    try {
      const u = new URL(v);
      if (u.protocol === "http:" || u.protocol === "https:") out[key] = u.toString();
    } catch {
      // URLとして解釈できない値（@ハンドルのみ等）は表示しない
    }
  }
  return out;
}

/**
 * 照会画面の詳細。閲覧権限のない相手は null（呼び出し側で404扱い）。
 */
export async function getDirectoryProfile(
  admin: SupabaseClient,
  params: { viewerRole: string; profileId: string },
): Promise<DirectoryProfile | null> {
  const targetRoles = viewableTargetRoles(params.viewerRole);
  if (targetRoles.length === 0) return null;
  // uuid型の列に不正な文字列を渡すとDBエラー(500)になるため、ここで弾いて404扱いにする
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.profileId)) return null;

  const { data: row, error } = await admin
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .eq("profile_id", params.profileId)
    .in("role", targetRoles)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const p = row as ProfileRow;

  // 主催者名・団体名は主催側の顔を持つロール(organizer/agent)のときだけ載せる
  const isOrganizerSide = TARGET_ROLES.organizer.includes(p.role);
  const profile: DirectoryProfile = {
    profile_id: p.profile_id,
    role: p.role,
    display_name: p.display_name,
    artist_name: p.artist_name,
    organizer_name: isOrganizerSide ? p.organizer_name : null,
    avatar_url: p.artist_avatar_url || p.organizer_avatar_url || p.avatar_url,
    organization_name: isOrganizerSide ? p.organization_name : null,
    genre: p.genre,
    affiliation: p.affiliation,
    bio: p.bio,
    social_links: safeSocialLinks(p.social_links),
    internal: null,
  };

  if (!isInternalViewer(params.viewerRole)) return profile;

  const [{ data: acct, error: acctErr }, { data: perf, error: perfErr }, { data: hosted, error: hostErr }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("status, stripe_connect_id, verification_status, stripe_restricted, balance_frozen, chargeback_count")
        .eq("profile_id", p.profile_id)
        .single(),
      admin
        .from("event_artists")
        .select("events!inner(event_id, title, start_at, lifecycle_status, deleted_at)")
        .eq("artist_profile_id", p.profile_id)
        .eq("status", "confirmed")
        .is("deleted_at", null)
        .in("events.lifecycle_status", ACHIEVED_LIFECYCLES)
        .is("events.deleted_at", null)
        .limit(EVENT_LIMIT),
      admin
        .from("events")
        .select("event_id, title, start_at, lifecycle_status")
        .eq("organizer_profile_id", p.profile_id)
        .in("lifecycle_status", ACHIEVED_LIFECYCLES)
        .is("deleted_at", null)
        .order("start_at", { ascending: false })
        .limit(EVENT_LIMIT),
    ]);
  if (acctErr) throw new Error(acctErr.message);
  if (perfErr) throw new Error(perfErr.message);
  if (hostErr) throw new Error(hostErr.message);

  type EventRow = DirectoryEvent & { deleted_at?: string | null };
  const toEvent = (e: EventRow): DirectoryEvent => ({
    event_id: e.event_id,
    title: e.title,
    start_at: e.start_at,
    lifecycle_status: e.lifecycle_status,
  });
  const performances = ((perf ?? []) as unknown as { events: EventRow }[])
    .map((r) => toEvent(r.events))
    .sort((a, b) => b.start_at.localeCompare(a.start_at));

  return {
    ...profile,
    internal: {
      registration_status: acct.status,
      account: {
        has_connect_account: !!acct.stripe_connect_id,
        verification_status: acct.verification_status,
        stripe_restricted: !!acct.stripe_restricted,
        balance_frozen: !!acct.balance_frozen,
        chargeback_count: acct.chargeback_count ?? 0,
      },
      performances,
      hosted_events: ((hosted ?? []) as EventRow[]).map(toEvent),
    },
  };
}
