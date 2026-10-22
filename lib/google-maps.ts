// Google の地図サービス（店の検索・位置から住所・地図の表示）の呼び出しと利用記録。
// 呼ぶ前に1回分の枠を確保し（google_api_reserve）、結果を記録する（google_api_finish）。
// 無料の回数は毎月1日の太平洋時間0時に戻るので、その月の回数が無料の上限に来たら呼ばずに null を返す（Hiro 2026-10-23）。
// Google に送るのは本人が言った店名・地域の文字、またはピンの位置だけ。記録には入力した文字を残さない。
// キーはサーバーだけで使う（GOOGLE_PLACES_API_KEY）。地図の表示はブラウザ用の別のキー（NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY）。
import type { SupabaseClient } from "@supabase/supabase-js";

export type GoogleService = "places_text_search" | "geocoding" | "maps_js";

// 料金区分と無料の上限（developers.google.com/maps/billing-and-pricing/pricing、2026-10-23 確認）
export const GOOGLE_LIMITS: Record<GoogleService, { sku: string; monthlyFree: number }> = {
  places_text_search: { sku: "text_search_pro", monthlyFree: 5_000 },
  geocoding: { sku: "geocoding_essentials", monthlyFree: 10_000 },
  maps_js: { sku: "dynamic_maps_essentials", monthlyFree: 10_000 },
};

// Text Search Pro に入るフィールドだけを取る。1つでも上の区分（評価・口コミ等）を足すと、その回はすべて高い料金になる
export const PLACES_FIELD_MASK = [
  "places.displayName",
  "places.formattedAddress",
  "places.postalAddress",
  "places.addressComponents",
  "places.location",
  "places.googleMapsUri",
  "places.businessStatus",
].join(",");

export type Outcome = "found" | "not_found" | "closed" | "error";

export type PlaceHit = {
  name: string;
  formattedAddress: string;
  postalCode: string | null;   // 例 "150-0041"
  latitude: number;
  longitude: number;
  mapsUri: string | null;
  closed: boolean;             // 閉店（CLOSED_PERMANENTLY）
};

export type GeocodeHit = { formattedAddress: string; postalCode: string | null };

type Fetch = typeof fetch;

export async function reserveGoogle(admin: SupabaseClient, service: GoogleService, profileId: string): Promise<number | null> {
  const { sku, monthlyFree } = GOOGLE_LIMITS[service];
  const { data, error } = await admin.rpc("google_api_reserve", {
    p_service: service, p_sku: sku, p_profile_id: profileId, p_monthly_limit: monthlyFree,
  });
  if (error) throw new Error(`google_api_reserve: ${error.message}`);
  return (data as number | null) ?? null;
}

export async function finishGoogle(admin: SupabaseClient, callId: number, outcome: Outcome): Promise<void> {
  await admin.rpc("google_api_finish", { p_call_id: callId, p_outcome: outcome });
}

type AddressComponent = { longText?: string; types?: string[] };
type PlaceRaw = {
  displayName?: { text?: string };
  formattedAddress?: string;
  postalAddress?: { postalCode?: string };
  addressComponents?: AddressComponent[];
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
  businessStatus?: string;
};

function postalOf(p: PlaceRaw): string | null {
  return p.postalAddress?.postalCode ?? p.addressComponents?.find((c) => c.types?.includes("postal_code"))?.longText ?? null;
}

// 店名と地域で探す。上限に来ていたら null（呼ばない）。見つからなければ []
export async function searchPlaces(
  admin: SupabaseClient,
  profileId: string,
  textQuery: string,
  opts: { fetch?: Fetch; apiKey?: string } = {},
): Promise<PlaceHit[] | null> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY が未設定");
  const callId = await reserveGoogle(admin, "places_text_search", profileId);
  if (callId == null) return null;
  try {
    const res = await (opts.fetch ?? fetch)("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACES_FIELD_MASK },
      body: JSON.stringify({ textQuery, languageCode: "ja", regionCode: "JP", pageSize: 5 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`places ${res.status}`);
    const json = (await res.json()) as { places?: PlaceRaw[] };
    const hits: PlaceHit[] = (json.places ?? [])
      .filter((p) => typeof p.location?.latitude === "number" && typeof p.location?.longitude === "number")
      .map((p) => ({
        name: p.displayName?.text ?? "",
        formattedAddress: p.formattedAddress ?? "",
        postalCode: postalOf(p),
        latitude: p.location!.latitude!,
        longitude: p.location!.longitude!,
        mapsUri: p.googleMapsUri ?? null,
        closed: p.businessStatus === "CLOSED_PERMANENTLY",
      }));
    await finishGoogle(admin, callId, hits.length === 0 ? "not_found" : hits.every((h) => h.closed) ? "closed" : "found");
    return hits;
  } catch (e) {
    await finishGoogle(admin, callId, "error").catch(() => {});
    throw e;
  }
}

// ピンの位置から、一番近い住所を引く。上限に来ていたら null（呼ばない）
export async function reverseGeocode(
  admin: SupabaseClient,
  profileId: string,
  latitude: number,
  longitude: number,
  opts: { fetch?: Fetch; apiKey?: string } = {},
): Promise<GeocodeHit | "not_found" | null> {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY が未設定");
  const callId = await reserveGoogle(admin, "geocoding", profileId);
  if (callId == null) return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${latitude},${longitude}`);
    url.searchParams.set("language", "ja");
    url.searchParams.set("result_type", "street_address|premise|sublocality|postal_code");
    url.searchParams.set("key", apiKey);
    const res = await (opts.fetch ?? fetch)(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    const json = (await res.json()) as {
      status?: string;
      results?: { formatted_address?: string; address_components?: { long_name?: string; types?: string[] }[] }[];
    };
    const first = json.results?.[0];
    if (json.status === "ZERO_RESULTS" || !first) {
      await finishGoogle(admin, callId, "not_found");
      return "not_found";
    }
    if (json.status !== "OK") throw new Error(`geocode ${json.status}`);
    await finishGoogle(admin, callId, "found");
    return {
      formattedAddress: first.formatted_address ?? "",
      postalCode: first.address_components?.find((c) => c.types?.includes("postal_code"))?.long_name ?? null,
    };
  } catch (e) {
    await finishGoogle(admin, callId, "error").catch(() => {});
    throw e;
  }
}
