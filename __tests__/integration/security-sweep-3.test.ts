/**
 * TC-SEC3: 2026-10-13 再監査（APIの持ち主確認漏れ・入力値の範囲）の回帰テスト
 *
 *   A. NFCの飛び先（booth-devices/sync・booth-holders）— 操作できるイベントのQRにしか向けられない
 *   B. QRグループ・表示スケジュール — 他のイベントのグループ・QRは指定できない
 *   C. 売上速報（live-stats）— 担当外のエージェントは見られない
 *   D. アーティスト検索（イベントの出演者選択＝照会API）— 検索語に条件を混ぜ込めない
 *   E. 配分比率 — 1人ずつ 0〜100%（合計100%でも 109% と -9% は通さない）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile, deleteAuthUsers, insertEvent, insertQrConfig, insertQrConfigTargets,
} from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

const auth = { userId: null as string | null };
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: auth.userId ? { id: auth.userId } : null }, error: null }) },
    from: (t: string) => testAdmin.from(t),
  })),
  getUser: vi.fn(async () => (auth.userId ? { id: auth.userId } : null)),
}));
vi.mock("next/headers", () => ({
  // 照会APIはステップアップ認証済みを要求するため dc_stepup だけ返す（他のcookieは無し）
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === "dc_stepup" ? { value: String(Date.now()) } : undefined),
    getAll: () => [],
  })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("@/lib/apple-wallet-push", () => ({
  pushWalletUpdateBySerial: vi.fn(async () => {}),
  sendWalletPush: vi.fn(async () => {}),
}));

import { POST as syncPOST } from "@/app/api/booth-devices/sync/route";
import { PATCH as holderPATCH } from "@/app/api/booth-holders/[holderId]/route";
import { POST as groupsPOST, PATCH as groupsPATCH } from "@/app/api/events/[eventId]/qr-groups/route";
import { POST as schedulesPOST } from "@/app/api/events/[eventId]/display-schedules/route";
import { GET as liveStatsGET } from "@/app/api/events/[eventId]/live-stats/route";
import { GET as directorySearchGET } from "@/app/api/directory/search/route";
import { PATCH as qrPATCH } from "@/app/api/qr/[qrConfigId]/route";
import { POST as qrCreatePOST } from "@/app/api/qr/create/route";

const ts = Date.now();
const profileIds: string[] = [];
const eventIds: string[] = [];
const qrConfigIds: string[] = [];

let adminId: string;
let orgA: string;
let orgB: string;
let agentA: string;
let agentX: string;
let artistId: string;
let eventA: string;
let eventB: string;
let qrA: string;
let qrB1: string;
let qrB2: string;
let deviceId: string;
let holderId: string;
let groupB: string;

const as = (id: string) => { auth.userId = id; };
const json = (method: string, body: unknown, url = "http://localhost") =>
  new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ev = (eventId: string) => ({ params: Promise.resolve({ eventId }) });

async function holder() {
  const { data } = await testAdmin.from("booth_holders")
    .select("current_event_id, current_qr_config_id").eq("holder_id", holderId).single();
  return data!;
}
async function groupMembers(groupId: string): Promise<string[]> {
  const { data } = await testAdmin.from("qr_group_members")
    .select("qr_config_id, sort_order").eq("qr_group_id", groupId).order("sort_order");
  return (data ?? []).map((m) => m.qr_config_id);
}

beforeAll(async () => {
  adminId = await insertProfile({ role: "admin", displayName: "SEC3 Admin", email: `sec3-admin-${ts}@test.local` });
  orgA = await insertProfile({ role: "organizer", displayName: "SEC3 OrgA", email: `sec3-orga-${ts}@test.local` });
  orgB = await insertProfile({ role: "organizer", displayName: "SEC3 OrgB", email: `sec3-orgb-${ts}@test.local` });
  agentA = await insertProfile({ role: "agent", displayName: "SEC3 AgentA", email: `sec3-agenta-${ts}@test.local` });
  agentX = await insertProfile({ role: "agent", displayName: "SEC3 AgentX", email: `sec3-agentx-${ts}@test.local` });
  artistId = await insertProfile({ role: "artist", displayName: `SEC3アーティスト${ts}`, email: `sec3-artist-${ts}@test.local` });
  profileIds.push(adminId, orgA, orgB, agentA, agentX, artistId);

  eventA = await insertEvent({ organizerProfileId: orgA, agentId: agentA, title: `SEC3 A ${ts}` });
  eventB = await insertEvent({ organizerProfileId: orgB, title: `SEC3 B ${ts}` });
  eventIds.push(eventA, eventB);

  qrA = await insertQrConfig({ eventId: eventA, creatorProfileId: orgA, recipientProfileId: artistId });
  qrB1 = await insertQrConfig({ eventId: eventB, creatorProfileId: orgB, recipientProfileId: artistId });
  qrB2 = await insertQrConfig({ eventId: eventB, creatorProfileId: orgB, recipientProfileId: artistId });
  qrConfigIds.push(qrA, qrB1, qrB2);
  await insertQrConfigTargets(qrA, [{ profileId: artistId, ratio: 1 }]);

  const { data: dev } = await testAdmin.from("equipment_devices")
    .insert({ display_name: `SEC3機材${ts}`, owner_profile_id: adminId }).select("device_id").single();
  deviceId = dev!.device_id;
  // 他の主催者（B）のイベントで、Bのお客様の支払い先（qrB1）に向いているホルダー
  const { data: h } = await testAdmin.from("booth_holders").insert({
    name: `SEC3ホルダー${ts}`, nfc_routing_id: `nfc-sec3-${ts}`, current_device_id: deviceId,
    current_event_id: eventB, current_qr_config_id: qrB1,
  }).select("holder_id").single();
  holderId = h!.holder_id;

  const { data: g } = await testAdmin.from("qr_groups").insert({ event_id: eventB, name: "SEC3 B group" }).select("qr_group_id").single();
  groupB = g!.qr_group_id;
  await testAdmin.from("qr_group_members").insert([
    { qr_group_id: groupB, qr_config_id: qrB1, sort_order: 0 },
    { qr_group_id: groupB, qr_config_id: qrB2, sort_order: 1 },
  ]);
}, 60_000);

afterAll(async () => {
  await testAdmin.from("booth_holders").delete().eq("holder_id", holderId);
  await testAdmin.from("equipment_devices").delete().eq("device_id", deviceId);
  await testAdmin.from("display_schedules").delete().in("event_id", eventIds);
  const { data: groups } = await testAdmin.from("qr_groups").select("qr_group_id").in("event_id", eventIds);
  const groupIds = (groups ?? []).map((g) => g.qr_group_id);
  if (groupIds.length) {
    await testAdmin.from("qr_group_members").delete().in("qr_group_id", groupIds);
    await testAdmin.from("qr_groups").delete().in("qr_group_id", groupIds);
  }
  const { data: createdQrs } = await testAdmin.from("qr_configs").select("qr_config_id, product_id").in("event_id", eventIds);
  const allQrIds = (createdQrs ?? []).map((q) => q.qr_config_id);
  if (allQrIds.length) {
    await testAdmin.from("qr_config_targets").delete().in("qr_config_id", allQrIds);
    await testAdmin.from("qr_configs").delete().in("qr_config_id", allQrIds);
  }
  await testAdmin.from("products").delete().in("event_id", eventIds);
  await testAdmin.from("events").delete().in("event_id", eventIds);
  await deleteAuthUsers(profileIds);
}, 60_000);

// ── A. NFCの飛び先 ──────────────────────────────────────────────────────────
describe("TC-SEC3-A: NFCの飛び先は操作できるイベントのQRにしか向けられない", () => {
  it("TC-SEC3-A-01: 主催者Aは、Bのイベントで使用中のホルダーをBの別のQRへ向けられない（409・飛び先そのまま）", async () => {
    as(orgA);
    const res = await syncPOST(json("POST", { device_id: deviceId, event_id: eventA, qr_config_id: qrB2 }));
    expect(res.status).toBe(409);
    expect(await holder()).toEqual({ current_event_id: eventB, current_qr_config_id: qrB1 });
  });

  it("TC-SEC3-A-02: 主催者Aは自分のQRへ切り替えられ、イベントはリクエストの値ではなくQRから記録される", async () => {
    as(orgA);
    const res = await syncPOST(json("POST", { device_id: deviceId, event_id: eventB, qr_config_id: qrA }));
    expect(res.status).toBe(200);
    expect(await holder()).toEqual({ current_event_id: eventA, current_qr_config_id: qrA });
  });

  it("TC-SEC3-A-03: QRなし（イベントだけ）の同期も、操作できないイベントは 409・変わらない", async () => {
    as(orgB);
    const res = await syncPOST(json("POST", { device_id: deviceId, event_id: eventA, qr_config_id: null }));
    expect(res.status).toBe(409);
    expect(await holder()).toEqual({ current_event_id: eventA, current_qr_config_id: qrA });
  });

  it("TC-SEC3-A-04: ホルダーの手動指定（booth-holders PATCH）も、他のイベントのQRは 403・変わらない", async () => {
    as(orgB);
    // B のイベントで使用中のホルダーに、B が A のイベントのQRを指定する
    await testAdmin.from("booth_holders").update({ current_event_id: eventB, current_qr_config_id: qrB1 }).eq("holder_id", holderId);
    const res = await holderPATCH(json("PATCH", { current_qr_config_id: qrA }), { params: Promise.resolve({ holderId }) });
    expect(res.status).toBe(403);
    expect(await holder()).toEqual({ current_event_id: eventB, current_qr_config_id: qrB1 });
  });

  it("TC-SEC3-A-05: ホルダーの手動指定で、自分のイベントのQRは今までどおり設定できる", async () => {
    as(orgB);
    const res = await holderPATCH(json("PATCH", { current_qr_config_id: qrB2 }), { params: Promise.resolve({ holderId }) });
    expect(res.status).toBe(200);
    expect(await holder()).toEqual({ current_event_id: eventB, current_qr_config_id: qrB2 });
  });
});

// ── B. QRグループ・表示スケジュール ──────────────────────────────────────────
describe("TC-SEC3-B: 他のイベントのグループ・QRは指定できない", () => {
  it("TC-SEC3-B-01: 自分のイベントIDで、Bのイベントのグループのメンバーを差し替えられない（404・中身そのまま）", async () => {
    as(orgA);
    const res = await groupsPATCH(json("PATCH", { qr_group_id: groupB, qr_config_ids: [qrA, qrA] }), ev(eventA));
    expect(res.status).toBe(404);
    expect(await groupMembers(groupB)).toEqual([qrB1, qrB2]);
  });

  it("TC-SEC3-B-02: グループ作成に他のイベントのQRを混ぜられない（400）", async () => {
    as(orgA);
    const res = await groupsPOST(json("POST", { name: "mix", qr_config_ids: [qrA, qrB1] }), ev(eventA));
    expect(res.status).toBe(400);
    const { count } = await testAdmin.from("qr_groups").select("qr_group_id", { count: "exact", head: true })
      .eq("event_id", eventA).eq("name", "mix");
    expect(count).toBe(0);
  });

  it("TC-SEC3-B-03: スケジュールに他のイベントのQR・グループは指定できない（400）", async () => {
    as(orgA);
    const now = Date.now();
    const base = { start_at: new Date(now + 3600_000).toISOString(), end_at: new Date(now + 7200_000).toISOString() };
    expect((await schedulesPOST(json("POST", { ...base, qr_config_id: qrB1 }), ev(eventA))).status).toBe(400);
    expect((await schedulesPOST(json("POST", { ...base, qr_group_id: groupB }), ev(eventA))).status).toBe(400);
  });

  it("TC-SEC3-B-04: 自分のイベントのQRなら今までどおり作れる（201）", async () => {
    as(orgA);
    const now = Date.now();
    const res = await schedulesPOST(json("POST", {
      start_at: new Date(now + 3600_000).toISOString(), end_at: new Date(now + 7200_000).toISOString(), qr_config_id: qrA,
    }), ev(eventA));
    expect(res.status).toBe(201);
  });
});

// ── C. 売上速報 ─────────────────────────────────────────────────────────────
describe("TC-SEC3-C: 売上速報は担当エージェントのみ", () => {
  const get = (eventId: string) => liveStatsGET(new Request(`http://localhost/api/events/${eventId}/live-stats?page=1`), ev(eventId));

  it("TC-SEC3-C-01: 担当外のエージェントは 403（購入者メール・売上が見えない）", async () => {
    as(agentX);
    expect((await get(eventA)).status).toBe(403);
  });

  it("TC-SEC3-C-02: 担当エージェント・主催者・管理者は 200", async () => {
    for (const id of [agentA, orgA, adminId]) {
      as(id);
      expect((await get(eventA)).status, id).toBe(200);
    }
  });

  it("TC-SEC3-C-03: 他の主催者は 403", async () => {
    as(orgB);
    expect((await get(eventA)).status).toBe(403);
  });
});

// ── D. アーティスト検索 ─────────────────────────────────────────────────────
describe("TC-SEC3-D: 検索語に条件を混ぜ込めない", () => {
  const search = async (q: string) => {
    as(orgA);
    const res = await directorySearchGET(new Request(`http://localhost/api/directory/search?types=artist&q=${encodeURIComponent(q)}`));
    expect(res.status).toBe(200);
    return ((await res.json()).results as { profile_id: string }[]).map((a) => a.profile_id);
  };

  it("TC-SEC3-D-01: 名前に一致しない語＋「,role.like.agen」で、エージェントが返らない", async () => {
    const ids = await search(`zzzz-no-match-${ts},role.like.agen`);
    expect(ids).toEqual([]);
  });

  it("TC-SEC3-D-02: 括弧・ワイルドカード（%）を混ぜても条件にならない", async () => {
    expect(await search(`zzzz-${ts}),or(role.like.agen`)).toEqual([]);
    expect(await search("%")).toEqual([]);
  });

  it("TC-SEC3-D-03: 通常の名前検索は今までどおり見つかる", async () => {
    expect(await search(`SEC3アーティスト${ts}`)).toEqual([artistId]);
  });
});

// ── E. 配分比率 ─────────────────────────────────────────────────────────────
describe("TC-SEC3-E: 配分比率は1人ずつ 0〜100%", () => {
  const twisted = [
    { profile_id: orgA, distribution_ratio: 1.09 },
    { profile_id: artistId, distribution_ratio: -0.09 },
  ];

  it("TC-SEC3-E-01: QR編集で 109% と -9%（合計100%）は 400・配分はそのまま", async () => {
    as(orgA);
    const res = await qrPATCH(json("PATCH", { targets: twisted }), { params: Promise.resolve({ qrConfigId: qrA }) });
    expect(res.status).toBe(400);
    const { data } = await testAdmin.from("qr_config_targets").select("profile_id, distribution_ratio")
      .eq("qr_config_id", qrA).is("deleted_at", null);
    expect(data!.map((t) => [t.profile_id, Number(t.distribution_ratio)])).toEqual([[artistId, 1]]);
  });

  it("TC-SEC3-E-02: QR作成でも 109% と -9% は 400", async () => {
    as(orgA);
    const res = await qrCreatePOST(json("POST", {
      event_id: eventA, label: "sec3", product_type: "standard", min_amount: 500, max_amount: 3000,
      recipient_profile_id: artistId, recipient_name_context: "artist", targets: twisted,
    }));
    expect(res.status).toBe(400);
  });

  it("TC-SEC3-E-03: 70% と 30% の編集は今までどおり通る（書き込みはサーバー権限）", async () => {
    as(orgA);
    const res = await qrPATCH(json("PATCH", {
      targets: [{ profile_id: orgA, distribution_ratio: 0.7 }, { profile_id: artistId, distribution_ratio: 0.3 }],
    }), { params: Promise.resolve({ qrConfigId: qrA }) });
    expect(res.status).toBe(200);
    const { data } = await testAdmin.from("qr_config_targets").select("profile_id, distribution_ratio")
      .eq("qr_config_id", qrA).is("deleted_at", null).order("distribution_ratio", { ascending: false });
    expect(data!.map((t) => [t.profile_id, Number(t.distribution_ratio)])).toEqual([[orgA, 0.7], [artistId, 0.3]]);
  });
});
