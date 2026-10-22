/* eslint-disable @typescript-eslint/no-explicit-any -- fetch の偽物を最小限の形で作るため */
/**
 * TC-GOOGLE-MAPS: Google の地図サービスの呼び出しと利用記録（lib/google-maps.ts・google_api_reserve）
 *
 * A. 利用記録：1回ごとに時刻・サービス・料金区分・誰が・結果を残す。入力した文字は残さない
 * B. 上限：太平洋時間の今月の回数が上限に来たら呼ばない（null）。先月（太平洋時間）の分は数えない
 * C. Google に送る中身：店名と地域の文字だけ／Text Search Pro のフィールドだけ／キーはヘッダー
 * D. 記録は service_role だけが触れる
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { testAdmin } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { PLACES_FIELD_MASK, reverseGeocode, searchPlaces } from "@/lib/google-maps";

const ts = Date.now();
const profileIds: string[] = [];
let organizerId: string;

function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init: any }[] = [];
  const f = (async (url: string, init: any) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const PLACE = {
  displayName: { text: "テストバー" },
  formattedAddress: "日本、〒150-0041 東京都渋谷区神南１丁目１９−５",
  postalAddress: { postalCode: "150-0041" },
  location: { latitude: 35.6618, longitude: 139.6979 },
  googleMapsUri: "https://maps.google.com/?cid=1",
  businessStatus: "OPERATIONAL",
};

async function rowsOf(profileId: string) {
  const { data } = await testAdmin.from("google_api_calls").select("*").eq("profile_id", profileId).order("call_id");
  return data ?? [];
}

beforeAll(async () => {
  organizerId = await insertProfile({ role: "organizer", displayName: "G Org", email: `g-org-${ts}@test.local` });
  profileIds.push(organizerId);
});

afterAll(async () => {
  await testAdmin.from("google_api_calls").delete().in("profile_id", profileIds);
  await deleteAuthUsers(profileIds);
});

describe("TC-GOOGLE-MAPS-A/C: 店の検索", () => {
  it("A-01: 見つかった店を返し、1回分を found で記録する（入力した文字は残さない）", async () => {
    const { f, calls } = fakeFetch({ places: [PLACE] });
    const hits = await searchPlaces(testAdmin, organizerId, "渋谷 テストバー", { fetch: f, apiKey: "k-test" });
    expect(hits).toEqual([{
      name: "テストバー",
      formattedAddress: "日本、〒150-0041 東京都渋谷区神南１丁目１９−５",
      postalCode: "150-0041",
      latitude: 35.6618,
      longitude: 139.6979,
      mapsUri: "https://maps.google.com/?cid=1",
      closed: false,
    }]);
    const rows = await rowsOf(organizerId);
    expect(rows.length).toBe(1);
    expect(rows[0].service).toBe("places_text_search");
    expect(rows[0].sku).toBe("text_search_pro");
    expect(rows[0].outcome).toBe("found");
    expect(Object.keys(rows[0]).sort()).toEqual(["call_id", "called_at", "outcome", "profile_id", "service", "sku"]);
    expect(JSON.stringify(rows[0]).includes("テストバー")).toBe(false);
    // C. 送った中身
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(calls[0].init.headers["X-Goog-Api-Key"]).toBe("k-test");
    expect(calls[0].init.headers["X-Goog-FieldMask"]).toBe(PLACES_FIELD_MASK);
    expect(JSON.parse(calls[0].init.body)).toEqual({ textQuery: "渋谷 テストバー", languageCode: "ja", regionCode: "JP", pageSize: 5 });
  });

  it("A-02: 見つからない → [] と not_found", async () => {
    const { f } = fakeFetch({});
    expect(await searchPlaces(testAdmin, organizerId, "存在しない店", { fetch: f, apiKey: "k" })).toEqual([]);
    const rows = await rowsOf(organizerId);
    expect(rows[rows.length - 1].outcome).toBe("not_found");
  });

  it("A-03: 全部閉店 → closed、閉店の印が付く", async () => {
    const { f } = fakeFetch({ places: [{ ...PLACE, businessStatus: "CLOSED_PERMANENTLY" }] });
    const hits = await searchPlaces(testAdmin, organizerId, "閉店した店", { fetch: f, apiKey: "k" });
    expect(hits?.map((h) => h.closed)).toEqual([true]);
    const rows = await rowsOf(organizerId);
    expect(rows[rows.length - 1].outcome).toBe("closed");
  });

  it("A-04: Google がエラー → 例外、error で記録", async () => {
    const { f } = fakeFetch({ error: {} }, 500);
    await expect(searchPlaces(testAdmin, organizerId, "x", { fetch: f, apiKey: "k" })).rejects.toThrow("places 500");
    const rows = await rowsOf(organizerId);
    expect(rows[rows.length - 1].outcome).toBe("error");
  });

  it("C-01: Text Search Pro のフィールドだけ（評価・口コミ等の上の区分を含まない）", () => {
    expect(PLACES_FIELD_MASK.split(",")).toEqual([
      "places.displayName", "places.formattedAddress", "places.postalAddress", "places.addressComponents",
      "places.location", "places.googleMapsUri", "places.businessStatus",
    ]);
  });
});

describe("TC-GOOGLE-MAPS-A: 位置から住所", () => {
  it("A-05: 一番近い住所と郵便番号を返し、geocoding を found で記録する。送るのは位置だけ", async () => {
    const { f, calls } = fakeFetch({
      status: "OK",
      results: [{ formatted_address: "日本、〒408-0000 山梨県北杜市大泉町西井出８２４０", address_components: [{ long_name: "408-0000", types: ["postal_code"] }] }],
    });
    expect(await reverseGeocode(testAdmin, organizerId, 35.87, 138.38, { fetch: f, apiKey: "k" }))
      .toEqual({ formattedAddress: "日本、〒408-0000 山梨県北杜市大泉町西井出８２４０", postalCode: "408-0000" });
    const u = new URL(calls[0].url);
    expect(u.searchParams.get("latlng")).toBe("35.87,138.38");
    const rows = await rowsOf(organizerId);
    expect([rows[rows.length - 1].service, rows[rows.length - 1].sku, rows[rows.length - 1].outcome]).toEqual(["geocoding", "geocoding_essentials", "found"]);
  });

  it("A-06: 住所が無い位置（海の上など）→ not_found", async () => {
    const { f } = fakeFetch({ status: "ZERO_RESULTS", results: [] });
    expect(await reverseGeocode(testAdmin, organizerId, 30, 140, { fetch: f, apiKey: "k" })).toBe("not_found");
  });
});

// 太平洋時間の今月の1日0時（UTC）。夏時間（-7）と標準時（-8）のどちらかを、その時刻のロサンゼルスの時で見分ける
function pacificMonthStart(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  for (const offset of [7, 8]) {
    const d = new Date(Date.UTC(y, m - 1, 1, offset));
    const hour = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(d);
    if (Number(hour) === 0) return d;
  }
  throw new Error("月初が求められない");
}

async function monthCount(service: string, since: Date) {
  const { count } = await testAdmin.from("google_api_calls").select("*", { count: "exact", head: true })
    .eq("service", service).gte("called_at", since.toISOString());
  return count!;
}

const reserve = (limit: number) =>
  testAdmin.rpc("google_api_reserve", { p_service: "maps_js", p_sku: "dynamic_maps_essentials", p_profile_id: organizerId, p_monthly_limit: limit });

describe("TC-GOOGLE-MAPS-B: 上限（太平洋時間の月）", () => {
  it("B-01: 今月の回数が上限に来たら確保しない（上限ちょうどまでは確保する）", async () => {
    const start = pacificMonthStart();
    const c = await monthCount("maps_js", start);
    const first = await reserve(c + 1);
    expect(first.error).toBe(null);
    expect(typeof first.data).toBe("number");
    const second = await reserve(c + 1);
    expect(second.error).toBe(null);
    expect(second.data).toBe(null);
    expect(await monthCount("maps_js", start)).toBe(c + 1);
  });

  it("B-02: 太平洋時間の先月の最後の1秒は数えず、今月の1日0時ちょうどは数える", async () => {
    const start = pacificMonthStart();
    const c = await monthCount("maps_js", start);
    await testAdmin.from("google_api_calls").insert({
      service: "maps_js", sku: "dynamic_maps_essentials", profile_id: organizerId, outcome: "found",
      called_at: new Date(start.getTime() - 1000).toISOString(),
    });
    const ok = await reserve(c + 1);
    expect(typeof ok.data).toBe("number");
    await testAdmin.from("google_api_calls").insert({
      service: "maps_js", sku: "dynamic_maps_essentials", profile_id: organizerId, outcome: "found",
      called_at: start.toISOString(),
    });
    const stop = await reserve(c + 2);
    expect(stop.data).toBe(null);
  });

  it("B-03: 枠が確保できなければ Google を呼ばない（店の検索・位置から住所とも null、fetch が0回）", async () => {
    // 枠の確保が null を返す（上限に来た）状態。上限の判定そのものは B-01・B-02 で本物の DB で確かめている
    const full = { rpc: async () => ({ data: null, error: null }) } as any;
    const { f, calls } = fakeFetch({ places: [PLACE] });
    expect(await searchPlaces(full, organizerId, "x", { fetch: f, apiKey: "k" })).toBe(null);
    expect(await reverseGeocode(full, organizerId, 35, 139, { fetch: f, apiKey: "k" })).toBe(null);
    expect(calls.length).toBe(0);
  });
});

describe("TC-GOOGLE-MAPS-D: 記録は service_role だけ", () => {
  it("D-01: 未ログインでは読めない・書けない・関数も呼べない", async () => {
    const anon = createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!);
    const { data } = await anon.from("google_api_calls").select("*").limit(1);
    expect(data ?? []).toEqual([]);
    const { error: insErr } = await anon.from("google_api_calls").insert({ service: "maps_js", sku: "x" });
    expect(insErr).not.toBe(null);
    const { error: rpcErr } = await anon.rpc("google_api_reserve", { p_service: "maps_js", p_sku: "x", p_profile_id: organizerId, p_monthly_limit: 10 });
    expect(rpcErr).not.toBe(null);
  });
});
