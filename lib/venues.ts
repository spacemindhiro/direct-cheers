// 会場マスタ（venues）の検索と登録。画面の API（app/api/venues）と、チアリー(AI) の MCP のツールの両方がここを通す。
// 会場マスタは組織横断で共有（同じハコに主催者ごとの別設定を作らないため）なので、検索は created_by で絞らず、
// 登録した会場は全主催者・全エージェントが選べる。直し・削除の画面と API は無い（直すには運営が DB を触る）。
// stripe_terminal_location_id はここでは作らない（タッチ決済で初めて必要になったときに lib/stripe-terminal-location.ts が作る）。
import type { SupabaseClient } from "@supabase/supabase-js";

export const VENUE_ROLES = ["organizer", "agent", "admin"] as const;

export type VenueSummary = { venue_id: string; name: string; prefecture: string; city: string };

// supabase は本人のセッションのクライアント（本人のロールはこれで読む）
export async function canUseVenues(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("role").eq("profile_id", userId).single();
  return (VENUE_ROLES as readonly string[]).includes(data?.role ?? "");
}

export async function searchVenues(admin: SupabaseClient, q: string): Promise<VenueSummary[]> {
  const query = q.trim();
  if (query.length < 1) return [];
  const { data, error } = await admin
    .from("venues")
    .select("venue_id, name, prefecture, city")
    .is("deleted_at", null)
    .ilike("name", `%${query}%`)
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type RegisterVenueInput = {
  name: string;
  postal_code: string;
  prefecture: string;
  city: string;
  town?: string | null;
  line1: string;
  latitude?: number | null;   // ピンの位置。緯度と経度は両方そろえるか、両方空
  longitude?: number | null;
};

export type RegisterVenueResult =
  | { ok: true; venue: VenueSummary }
  | { ok: false; status: number; error: string };

export async function registerVenue(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  input: RegisterVenueInput,
): Promise<RegisterVenueResult> {
  if (!(await canUseVenues(supabase, userId))) return { ok: false, status: 403, error: "Forbidden" };

  const { name, postal_code, prefecture, city, town, line1, latitude = null, longitude = null } = input;
  if (!name?.trim() || !postal_code?.trim() || !prefecture?.trim() || !city?.trim() || !line1?.trim()) {
    return { ok: false, status: 400, error: "Missing required fields" };
  }
  const hasLat = typeof latitude === "number" && Number.isFinite(latitude);
  const hasLng = typeof longitude === "number" && Number.isFinite(longitude);
  if ((latitude != null || longitude != null) &&
      (!hasLat || !hasLng || latitude! < -90 || latitude! > 90 || longitude! < -180 || longitude! > 180)) {
    return { ok: false, status: 400, error: "位置の形式が正しくありません" };
  }

  const { data, error } = await admin
    .from("venues")
    .insert({
      created_by: userId,
      name: name.trim(),
      postal_code: postal_code.trim(),
      prefecture: prefecture.trim(),
      city: city.trim(),
      town: town?.trim() || null,
      line1: line1.trim(),
      latitude: hasLat ? latitude : null,
      longitude: hasLng ? longitude : null,
    })
    .select("venue_id, name, prefecture, city")
    .single();

  if (error) {
    // unique制約違反（同名会場が既に存在）
    if (error.code === "23505") return { ok: false, status: 409, error: "同じ名前の会場が既に登録されています" };
    return { ok: false, status: 500, error: error.message };
  }
  return { ok: true, venue: data };
}
