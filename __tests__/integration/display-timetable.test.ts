/**
 * TC-DISPLAY: QR子機マルチトラック・タイムテーブル機能のテスト
 *
 * カバレッジ:
 *   A. display-tracks GET/POST/PATCH/DELETE — トラックCRUD・権限・削除時のtrack_id解除
 *   B. display-devices POST — 子機自己登録（upsert・track_id保持）
 *   C. display-devices/[deviceId] PATCH — トラック割当変更
 *   D. display-schedules拡張 — track_idフィルタ・all・POSTのtrack_id検証
 *   E. 後方互換 — トラック未作成イベントでの既存挙動
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers, insertEvent, insertQrConfig } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient, getUser } from "@/lib/supabase/server";
import { GET as tracksGET, POST as tracksPOST, PATCH as tracksPATCH, DELETE as tracksDELETE } from "@/app/api/events/[eventId]/display-tracks/route";
import { GET as devicesGET, POST as devicesPOST } from "@/app/api/events/[eventId]/display-devices/route";
import { PATCH as devicePATCH } from "@/app/api/events/[eventId]/display-devices/[deviceId]/route";
import { GET as schedulesGET, POST as schedulesPOST, PATCH as schedulesPATCH } from "@/app/api/events/[eventId]/display-schedules/route";

let adminProfileId: string;
let organizerProfileId: string;
let otherOrganizerProfileId: string;
let artistProfileId: string;
let eventId: string;
let event2Id: string;
let qrConfigA: string;
let qrConfigB: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
};

function mockAs(id: string, role: string) {
  (getUser as any).mockResolvedValue({ id });
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role } }) };
      }
      return testAdmin.from(table);
    }),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  adminProfileId = await insertProfile({ role: "admin", displayName: "管理者（display）", email: `admin-disp-${ts}@test.local` });
  organizerProfileId = await insertProfile({ role: "organizer", displayName: "オーガナイザー（display）", email: `org-disp-${ts}@test.local` });
  otherOrganizerProfileId = await insertProfile({ role: "organizer", displayName: "他org（display）", email: `other-org-disp-${ts}@test.local` });
  artistProfileId = await insertProfile({ role: "artist", displayName: "アーティスト（display）", email: `artist-disp-${ts}@test.local` });
  cleanup.profileIds.push(adminProfileId, organizerProfileId, otherOrganizerProfileId, artistProfileId);

  eventId = await insertEvent({ organizerProfileId, title: "TC-DISPLAYイベント" });
  event2Id = await insertEvent({ organizerProfileId, title: "TC-DISPLAY後方互換イベント" });
  cleanup.eventIds.push(eventId, event2Id);

  qrConfigA = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId });
  qrConfigB = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId });
  cleanup.qrConfigIds.push(qrConfigA, qrConfigB);
}, 30_000);

afterAll(async () => {
  if (cleanup.qrConfigIds.length)
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  if (cleanup.eventIds.length)
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-DISPLAY-A: display-tracks CRUD ───────────────────────────────────
describe("TC-DISPLAY-A: display-tracks — トラックCRUD・権限", () => {
  let mainTrackId: string;
  let subTrackId: string;

  it("TC-DISPLAY-A-01: organizerがトラック作成 → 201", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "メインステージ", default_qr_config_id: qrConfigA }),
    });
    const res = await tracksPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.track_id).toBeTruthy();
    mainTrackId = data.track_id;
  });

  it("TC-DISPLAY-A-02: GET一覧に作成したトラック・default_qr_configがjoinされる", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", { method: "GET" });
    const res = await tracksGET(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    const track = data.find((t: any) => t.track_id === mainTrackId);
    expect(track).toBeTruthy();
    expect(track.name).toBe("メインステージ");
    expect(track.default_qr_config?.qr_config_id).toBe(qrConfigA);
  });

  it("TC-DISPLAY-A-03: 別オーガナイザーによるトラック作成 → 403", async () => {
    mockAs(otherOrganizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "不正トラック" }),
    });
    const res = await tracksPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(403);
  });

  it("TC-DISPLAY-A-04: organizerがトラック名を更新 → 200・GETに反映", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track_id: mainTrackId, name: "メインステージ（改）" }),
    });
    const res = await tracksPATCH(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);

    const getReq = new Request("http://localhost", { method: "GET" });
    const getRes = await tracksGET(getReq, { params: Promise.resolve({ eventId }) });
    const data = await getRes.json();
    const track = data.find((t: any) => t.track_id === mainTrackId);
    expect(track.name).toBe("メインステージ（改）");
  });

  it("TC-DISPLAY-A-05: adminがトラック作成 → 201（権限オーバーライド）", async () => {
    mockAs(adminProfileId, "admin");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "サブステージ" }),
    });
    const res = await tracksPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(201);
    const data = await res.json();
    subTrackId = data.track_id;
  });

  it("TC-DISPLAY-A-06: organizerがトラックを削除 → ソフトデリートされGET一覧から消える", async () => {
    mockAs(organizerProfileId, "organizer");
    const delReq = new Request(`http://localhost?track_id=${subTrackId}`, { method: "DELETE" });
    const delRes = await tracksDELETE(delReq, { params: Promise.resolve({ eventId }) });
    expect(delRes.status).toBe(200);

    const getReq = new Request("http://localhost", { method: "GET" });
    const getRes = await tracksGET(getReq, { params: Promise.resolve({ eventId }) });
    const data = await getRes.json();
    expect(data.find((t: any) => t.track_id === subTrackId)).toBeUndefined();
  });

  it("TC-DISPLAY-A-07: トラック削除時、紐づくスケジュール・デバイスのtrack_idがnullに戻る", async () => {
    mockAs(organizerProfileId, "organizer");

    // 一時トラック作成
    const createReq = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "一時トラック" }),
    });
    const createRes = await tracksPOST(createReq, { params: Promise.resolve({ eventId }) });
    const { track_id: tempTrackId } = await createRes.json();

    // このトラックに紐づくスケジュールを作成
    const now = Date.now();
    const schedReq = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        track_id: tempTrackId,
        qr_config_id: qrConfigA,
        start_at: new Date(now + 10 * 3600_000).toISOString(),
        end_at: new Date(now + 11 * 3600_000).toISOString(),
        label: "一時スロット",
      }),
    });
    const schedRes = await schedulesPOST(schedReq, { params: Promise.resolve({ eventId }) });
    const { schedule_id: tempScheduleId } = await schedRes.json();

    // このトラックに紐づくデバイスを作成
    const deviceId = crypto.randomUUID();
    const devReq = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, device_name: "一時デバイス" }),
    });
    await devicesPOST(devReq, { params: Promise.resolve({ eventId }) });
    await testAdmin.from("display_devices").update({ track_id: tempTrackId }).eq("event_id", eventId).eq("device_id", deviceId);

    // トラック削除
    const delReq = new Request(`http://localhost?track_id=${tempTrackId}`, { method: "DELETE" });
    const delRes = await tracksDELETE(delReq, { params: Promise.resolve({ eventId }) });
    expect(delRes.status).toBe(200);

    // スケジュール・デバイスのtrack_idがnullに戻っていることを確認
    const { data: sched } = await testAdmin.from("display_schedules").select("track_id").eq("schedule_id", tempScheduleId).single();
    expect(sched?.track_id).toBeNull();

    const { data: dev } = await testAdmin.from("display_devices").select("track_id").eq("event_id", eventId).eq("device_id", deviceId).single();
    expect(dev?.track_id).toBeNull();
  });
});

// ── TC-DISPLAY-B: display-devices POST upsert ───────────────────────────
describe("TC-DISPLAY-B: display-devices — 子機自己登録（upsert）", () => {
  const deviceId = crypto.randomUUID();
  let trackId: string;

  it("TC-DISPLAY-B-01: 新規デバイスをPOST → track_id=null・default_qr_config=null", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, device_name: "iPad-AAAA" }),
    });
    const res = await devicesPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.track_id).toBeNull();
    expect(data.default_qr_config).toBeNull();

    const { data: dev } = await testAdmin.from("display_devices").select("device_name, track_id").eq("event_id", eventId).eq("device_id", deviceId).single();
    expect(dev?.device_name).toBe("iPad-AAAA");
    expect(dev?.track_id).toBeNull();
  });

  it("TC-DISPLAY-B-02: トラック割当済みデバイスを再POST → track_id保持・device_name更新・default_qr_config返却", async () => {
    // トラックを作成しデフォルトQRを設定
    mockAs(organizerProfileId, "organizer");
    const trackReq = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bテスト用トラック", default_qr_config_id: qrConfigB }),
    });
    const trackRes = await tracksPOST(trackReq, { params: Promise.resolve({ eventId }) });
    trackId = (await trackRes.json()).track_id;

    // 既存デバイスに割当（コントロールパネルからの操作を模擬）
    await testAdmin.from("display_devices").update({ track_id: trackId }).eq("event_id", eventId).eq("device_id", deviceId);

    // 再登録
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, device_name: "iPad-AAAA-renamed" }),
    });
    const res = await devicesPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.track_id).toBe(trackId);
    expect(data.default_qr_config?.qr_config_id).toBe(qrConfigB);

    const { data: dev } = await testAdmin.from("display_devices").select("device_name, track_id").eq("event_id", eventId).eq("device_id", deviceId).single();
    expect(dev?.device_name).toBe("iPad-AAAA-renamed");
    expect(dev?.track_id).toBe(trackId);
  });

  it("TC-DISPLAY-B-03: GET一覧に登録したデバイスが含まれる", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", { method: "GET" });
    const res = await devicesGET(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.find((d: any) => d.device_id === deviceId)).toBeTruthy();
  });
});

// ── TC-DISPLAY-C: display-devices/[deviceId] PATCH ──────────────────────
describe("TC-DISPLAY-C: display-devices/[deviceId] — トラック割当変更", () => {
  const deviceId = crypto.randomUUID();
  let trackId: string;

  beforeAll(async () => {
    mockAs(organizerProfileId, "organizer");
    const devReq = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, device_name: "Cテスト用デバイス" }),
    });
    await devicesPOST(devReq, { params: Promise.resolve({ eventId }) });

    const trackReq = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Cテスト用トラック" }),
    });
    const trackRes = await tracksPOST(trackReq, { params: Promise.resolve({ eventId }) });
    trackId = (await trackRes.json()).track_id;
  });

  it("TC-DISPLAY-C-01: organizerがトラック割当 → 200・DB反映", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track_id: trackId }),
    });
    const res = await devicePATCH(req, { params: Promise.resolve({ eventId, deviceId }) });
    expect(res.status).toBe(200);

    const { data: dev } = await testAdmin.from("display_devices").select("track_id").eq("event_id", eventId).eq("device_id", deviceId).single();
    expect(dev?.track_id).toBe(trackId);
  });

  it("TC-DISPLAY-C-02: track_id=nullで割当解除 → 200・DBがnullに戻る", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track_id: null }),
    });
    const res = await devicePATCH(req, { params: Promise.resolve({ eventId, deviceId }) });
    expect(res.status).toBe(200);

    const { data: dev } = await testAdmin.from("display_devices").select("track_id").eq("event_id", eventId).eq("device_id", deviceId).single();
    expect(dev?.track_id).toBeNull();
  });

  it("TC-DISPLAY-C-03: 存在しないtrack_idを指定 → 400", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track_id: crypto.randomUUID() }),
    });
    const res = await devicePATCH(req, { params: Promise.resolve({ eventId, deviceId }) });
    expect(res.status).toBe(400);
  });

  it("TC-DISPLAY-C-04: 別オーガナイザーによる割当変更 → 403", async () => {
    mockAs(otherOrganizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track_id: trackId }),
    });
    const res = await devicePATCH(req, { params: Promise.resolve({ eventId, deviceId }) });
    expect(res.status).toBe(403);
  });
});

// ── TC-DISPLAY-D: display-schedules拡張 ─────────────────────────────────
describe("TC-DISPLAY-D: display-schedules — track_idフィルタ・all・検証", () => {
  let trackId: string;
  let scheduleCommonId: string;
  let scheduleTrackId: string;

  beforeAll(async () => {
    mockAs(organizerProfileId, "organizer");
    const trackReq = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dテスト用トラック" }),
    });
    const trackRes = await tracksPOST(trackReq, { params: Promise.resolve({ eventId }) });
    trackId = (await trackRes.json()).track_id;
  });

  it("TC-DISPLAY-D-01: track_id省略でスケジュール作成 → 201（共通スロット）", async () => {
    mockAs(organizerProfileId, "organizer");
    const now = Date.now();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: qrConfigA,
        start_at: new Date(now + 20 * 3600_000).toISOString(),
        end_at: new Date(now + 21 * 3600_000).toISOString(),
        label: "共通スロット",
      }),
    });
    const res = await schedulesPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(201);
    scheduleCommonId = (await res.json()).schedule_id;
  });

  it("TC-DISPLAY-D-02: track_id指定でスケジュール作成 → 201（トラックスロット）", async () => {
    mockAs(organizerProfileId, "organizer");
    const now = Date.now();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        track_id: trackId,
        qr_config_id: qrConfigB,
        start_at: new Date(now + 22 * 3600_000).toISOString(),
        end_at: new Date(now + 23 * 3600_000).toISOString(),
        label: "トラックスロット",
      }),
    });
    const res = await schedulesPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(201);
    scheduleTrackId = (await res.json()).schedule_id;
  });

  it("TC-DISPLAY-D-03: GET（クエリ無し） → track_id IS NULLのスロットのみ", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", { method: "GET" });
    const res = await schedulesGET(req, { params: Promise.resolve({ eventId }) });
    const data = await res.json();
    const ids = data.map((s: any) => s.schedule_id);
    expect(ids).toContain(scheduleCommonId);
    expect(ids).not.toContain(scheduleTrackId);
  });

  it("TC-DISPLAY-D-04: GET ?track_id=<trackId> → そのトラックのスロットのみ", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request(`http://localhost?track_id=${trackId}`, { method: "GET" });
    const res = await schedulesGET(req, { params: Promise.resolve({ eventId }) });
    const data = await res.json();
    const ids = data.map((s: any) => s.schedule_id);
    expect(ids).toContain(scheduleTrackId);
    expect(ids).not.toContain(scheduleCommonId);
  });

  it("TC-DISPLAY-D-05: GET ?all=1 → 全トラック分のスロットを返す", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost?all=1", { method: "GET" });
    const res = await schedulesGET(req, { params: Promise.resolve({ eventId }) });
    const data = await res.json();
    const ids = data.map((s: any) => s.schedule_id);
    expect(ids).toContain(scheduleCommonId);
    expect(ids).toContain(scheduleTrackId);
  });

  it("TC-DISPLAY-D-06: 存在しないtrack_idでスケジュール作成 → 400", async () => {
    mockAs(organizerProfileId, "organizer");
    const now = Date.now();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        track_id: crypto.randomUUID(),
        qr_config_id: qrConfigA,
        start_at: new Date(now + 24 * 3600_000).toISOString(),
        end_at: new Date(now + 25 * 3600_000).toISOString(),
      }),
    });
    const res = await schedulesPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
  });
});

// ── TC-DISPLAY-F: display-schedules PATCH — 設定済みスロットの編集 ──────────
describe("TC-DISPLAY-F: display-schedules PATCH — スロット編集", () => {
  let scheduleId: string;

  beforeAll(async () => {
    mockAs(organizerProfileId, "organizer");
    const now = Date.now();
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: qrConfigA,
        start_at: new Date(now + 40 * 3600_000).toISOString(),
        end_at: new Date(now + 41 * 3600_000).toISOString(),
        label: "編集前スロット",
      }),
    });
    const res = await schedulesPOST(req, { params: Promise.resolve({ eventId }) });
    scheduleId = (await res.json()).schedule_id;
  });

  it("TC-DISPLAY-F-01: organizerがスロットを編集 → 200・GETに反映される", async () => {
    mockAs(organizerProfileId, "organizer");
    const now = Date.now();
    const newStart = new Date(now + 42 * 3600_000).toISOString();
    const newEnd = new Date(now + 43 * 3600_000).toISOString();
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule_id: scheduleId,
        qr_config_id: qrConfigB,
        start_at: newStart,
        end_at: newEnd,
        label: "編集後スロット",
      }),
    });
    const res = await schedulesPATCH(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);

    const getReq = new Request("http://localhost", { method: "GET" });
    const getRes = await schedulesGET(getReq, { params: Promise.resolve({ eventId }) });
    const data = await getRes.json();
    const sched = data.find((s: any) => s.schedule_id === scheduleId);
    expect(sched).toBeTruthy();
    expect(sched.qr_config_id).toBe(qrConfigB);
    expect(sched.label).toBe("編集後スロット");
    expect(new Date(sched.start_at).toISOString()).toBe(newStart);
    expect(new Date(sched.end_at).toISOString()).toBe(newEnd);
  });

  it("TC-DISPLAY-F-02: end_at <= start_at → 400", async () => {
    mockAs(organizerProfileId, "organizer");
    const now = Date.now();
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule_id: scheduleId,
        start_at: new Date(now + 50 * 3600_000).toISOString(),
        end_at: new Date(now + 49 * 3600_000).toISOString(),
      }),
    });
    const res = await schedulesPATCH(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
  });

  it("TC-DISPLAY-F-03: schedule_id欠損 → 400", async () => {
    mockAs(organizerProfileId, "organizer");
    const now = Date.now();
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_at: new Date(now + 50 * 3600_000).toISOString(),
        end_at: new Date(now + 51 * 3600_000).toISOString(),
      }),
    });
    const res = await schedulesPATCH(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
  });

  it("TC-DISPLAY-F-04: 別オーガナイザーによる編集 → 403", async () => {
    mockAs(otherOrganizerProfileId, "organizer");
    const now = Date.now();
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule_id: scheduleId,
        start_at: new Date(now + 50 * 3600_000).toISOString(),
        end_at: new Date(now + 51 * 3600_000).toISOString(),
      }),
    });
    const res = await schedulesPATCH(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(403);
  });
});

// ── TC-DISPLAY-E: 後方互換 ───────────────────────────────────────────────
describe("TC-DISPLAY-E: 後方互換 — トラック未作成イベントでの既存挙動", () => {
  it("TC-DISPLAY-E-01: トラック未作成イベントでtrack_id省略のスケジュール作成・取得が従来通り動作する", async () => {
    mockAs(organizerProfileId, "organizer");
    const now = Date.now();
    const postReq = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qr_config_id: qrConfigA,
        start_at: new Date(now + 30 * 3600_000).toISOString(),
        end_at: new Date(now + 31 * 3600_000).toISOString(),
        label: "後方互換スロット",
      }),
    });
    const postRes = await schedulesPOST(postReq, { params: Promise.resolve({ eventId: event2Id }) });
    expect(postRes.status).toBe(201);
    const { schedule_id: scheduleId } = await postRes.json();

    const getReq = new Request("http://localhost", { method: "GET" });
    const getRes = await schedulesGET(getReq, { params: Promise.resolve({ eventId: event2Id }) });
    const data = await getRes.json();
    const sched = data.find((s: any) => s.schedule_id === scheduleId);
    expect(sched).toBeTruthy();
    expect(sched.track_id).toBeNull();
  });
});
