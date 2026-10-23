/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase クライアントと fetch の偽物を最小限の形で作るため */
/**
 * TC-CHEERY-ACTION: 確認カードのボタン（/api/cheery/action）
 *
 * | 呼ぶ人                | map_load / pin_to_address | register_venue / create_event_draft |
 * |-----------------------|---------------------------|-------------------------------------|
 * | 未ログイン             | × 401                     | × 401                               |
 * | 一般ユーザー           | × 403                     | × 403（ツールが無い）・行が増えない     |
 * | オーガナイザー         | ○                         | ○（中身は MCP の書き込みのツール）     |
 * create_qr も同じ（中身の判定は TC-CHEERY-QR）。
 * 地図の表示は呼ぶたびに1回と数える。共用の関数の英語のエラーは画面の文にする。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { testAdmin } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), getUser: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { POST } from "@/app/api/cheery/action/route";

const ts = Date.now();
const P: Record<string, string> = {};
const profiles: string[] = [];
const events: string[] = [];
let venueId: string;
const realFetch = globalThis.fetch;

function asUser(id: string | null) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: id ? { id, email: null } : null }, error: null }) },
    from: (table: string) => testAdmin.from(table),
  });
}
const post = (body: unknown) => POST(new Request("http://localhost/api/cheery/action", { method: "POST", body: JSON.stringify(body) }));
const mapsCount = async () =>
  (await testAdmin.from("google_api_calls").select("*", { count: "exact", head: true }).eq("profile_id", P.org).eq("service", "maps_js")).count;

beforeAll(async () => {
  vi.stubGlobal("fetch", (input: any, init?: any) => {
    const u = typeof input === "string" ? input : input.url;
    const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
    if (u.startsWith("https://maps.googleapis.com/maps/api/geocode/")) {
      return json({ status: "OK", results: [{ formatted_address: "日本、〒408-0000 山梨県北杜市", address_components: [{ long_name: "408-0000", types: ["postal_code"] }] }] });
    }
    if (u.startsWith("https://postcode.teraren.com/postcodes/4080000")) return json({ prefecture: "山梨県", city: "北杜市", suburb: "" });
    return realFetch(input, init);
  });
  process.env.GOOGLE_PLACES_API_KEY = "k-test";
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY = "k-browser";
  for (const [k, role] of [["usr", "user"], ["org", "organizer"], ["ag", "agent"]] as const) {
    P[k] = await insertProfile({ role, displayName: `ACT ${k} ${ts}`, email: `act-${k}-${ts}@test.local` });
    profiles.push(P[k]);
  }
  await testAdmin.from("profiles").update({ responsible_agent_id: P.ag }).eq("profile_id", P.org);
  const { data: v } = await testAdmin.from("venues").insert({
    created_by: P.org, name: `ACT会場${ts}`, postal_code: "150-0041", prefecture: "東京都", city: "渋谷区", line1: "1",
  }).select("venue_id").single();
  venueId = v!.venue_id;
}, 60_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  if (events.length) await testAdmin.from("events").delete().in("event_id", events);
  await testAdmin.from("cheery_card_uses").delete().in("profile_id", profiles);
  await testAdmin.from("venues").delete().in("created_by", profiles);
  await testAdmin.from("google_api_calls").delete().in("profile_id", profiles);
  await deleteAuthUsers(profiles);
});

const draft = (over: Record<string, unknown> = {}) => ({
  action: "create_event_draft", card_id: crypto.randomUUID(), title: `ACT下書き${ts}`, venue_id: venueId,
  start_at: "2026-12-10T10:00:00.000Z", end_at: "2026-12-10T13:00:00.000Z", organizer_profile_id: null, performer_ids: [], ...over,
});

describe("TC-CHEERY-ACTION", () => {
  it("A-01: 未ログインは 401", async () => {
    asUser(null);
    const res = await post({ action: "map_load" });
    expect(res.status).toBe(401);
  });

  it("A-02: 形の違う入力は 400", async () => {
    asUser(P.org);
    const res = await post({ action: "delete_everything" });
    expect([res.status, await res.json()]).toEqual([400, { ok: false, error: "入力の形式が正しくありません" }]);
  });

  it("A-03: 一般ユーザーは地図も書き込みも使えない（行が増えない）", async () => {
    asUser(P.usr);
    expect((await post({ action: "map_load" })).status).toBe(403);
    const res = await post(draft({ title: `ACT不正${ts}` }));
    expect([res.status, await res.json()]).toEqual([403, { ok: false, error: "この操作はできません" }]);
    expect((await testAdmin.from("events").select("*", { count: "exact", head: true }).eq("title", `ACT不正${ts}`)).count).toBe(0);
  });

  it("A-04: 地図を出すたびに1回と数える", async () => {
    asUser(P.org);
    const before = await mapsCount();
    const res = await post({ action: "map_load" });
    expect([res.status, await res.json()]).toEqual([200, { ok: true }]);
    expect(await mapsCount()).toBe(before! + 1);
  });

  it("A-05: ピンの位置から、番地が空の会場カードを作る（目印はカードで入れてもらう）", async () => {
    asUser(P.org);
    const res = await post({ action: "pin_to_address", name: `ピン会場${ts}`, latitude: 35.87, longitude: 138.38 });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect({ ...body.card, card_id: "x" }).toEqual({
      kind: "venue_register", card_id: "x", name: `ピン会場${ts}`, postal_code: "408-0000", prefecture: "山梨県", city: "北杜市", town: null, line1: "",
      latitude: 35.87, longitude: 138.38, maps_uri: null, source: "pin",
    });
    // 目印を入れて登録すると、ピンの位置も入る
    const reg = await post({ action: "register_venue", card_id: body.card.card_id, name: body.card.name, postal_code: "408-0000", prefecture: "山梨県", city: "北杜市", town: null, line1: "白いゲート前", latitude: 35.87, longitude: 138.38 });
    expect(reg.status).toBe(200);
    const { data: row } = await testAdmin.from("venues").select("line1, latitude, longitude").eq("name", `ピン会場${ts}`).single();
    expect(row).toEqual({ line1: "白いゲート前", latitude: 35.87, longitude: 138.38 });
  });

  it("A-06: 下書きを作れる。共用の関数の英語のエラーは画面の文にする", async () => {
    asUser(P.org);
    const ok = await post(draft());
    const body = await ok.json();
    expect([ok.status, body.ok, body.already]).toEqual([200, true, false]);
    events.push(body.eventId);
    const ng = await post(draft({ organizer_profile_id: P.usr }));
    expect([ng.status, await ng.json()]).toEqual([400, { ok: false, error: "この名義では作れません" }]);
  });

  it("A-07: 一般ユーザーは create_qr も使えない。QR 用に、作成 API の英語のエラーは画面の文にする", async () => {
    const qr = (over: Record<string, unknown> = {}) => ({
      action: "create_qr", card_id: crypto.randomUUID(), event_id: crypto.randomUUID(), product_type: "standard", payment_type: null, label: "ACT",
      min_amount: 1000, max_amount: 1000, stock_limit: null, sales_start_at: null, sales_end_at: null,
      recipient_profile_id: P.org, recipient_name_context: "organizer", targets: [{ profile_id: P.org, distribution_ratio: 1 }], image_url: null, ...over,
    });
    asUser(P.usr);
    const ng = await post(qr());
    expect([ng.status, await ng.json()]).toEqual([403, { ok: false, error: "この操作はできません" }]);
    // 存在しないイベント（作成 API は「Event not found」）
    asUser(P.org);
    const missing = await post(qr());
    expect([missing.status, await missing.json()]).toEqual([400, { ok: false, error: "このイベントの QR は作れません" }]);
  });
});
