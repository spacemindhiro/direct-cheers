/**
 * TC-BOOTH: NFCタグ⇔子機タブレット ペアリング機能のテスト
 *
 * カバレッジ:
 *   A. /api/booth-devices GET/POST — ペアリング一覧・upsert・権限
 *   B. /api/booth-devices/sync POST — QR切替連動の同期・未登録device_codeの扱い
 *   C. /r/[nfcRoutingId] — リダイレクト先解決ロジック
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
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { createClient, getUser } from "@/lib/supabase/server";
import { GET as boothDevicesGET, POST as boothDevicesPOST } from "@/app/api/booth-devices/route";
import { POST as boothDevicesSyncPOST } from "@/app/api/booth-devices/sync/route";
import NfcRoutingPage from "@/app/r/[nfcRoutingId]/page";

let organizerProfileId: string;
let artistProfileId: string;
let eventId: string;
let qrConfigA: string;
let qrConfigB: string;

const ts = Date.now();
const deviceCodeMain = `booth_tc_${ts}`;
const deviceCodeUnregistered = `booth_tc_unreg_${ts}`;
const deviceCodeNoTarget = `booth_tc_notarget_${ts}`;
const nfcMain = `nfc_tc_${ts}`;
const nfcNoTarget = `nfc_tc_notarget_${ts}`;
const nfcNotFound = `nfc_tc_notfound_${ts}`;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  deviceCodes: [] as string[],
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
  organizerProfileId = await insertProfile({ role: "organizer", displayName: "オーガナイザー（booth）", email: `org-booth-${ts}@test.local` });
  artistProfileId = await insertProfile({ role: "artist", displayName: "アーティスト（booth）", email: `artist-booth-${ts}@test.local` });
  cleanup.profileIds.push(organizerProfileId, artistProfileId);

  eventId = await insertEvent({ organizerProfileId, title: "TC-BOOTHイベント" });
  cleanup.eventIds.push(eventId);

  qrConfigA = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId });
  qrConfigB = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistProfileId });
  cleanup.qrConfigIds.push(qrConfigA, qrConfigB);
}, 30_000);

afterAll(async () => {
  if (cleanup.deviceCodes.length)
    await testAdmin.from("booth_devices").delete().in("device_code", cleanup.deviceCodes);
  if (cleanup.qrConfigIds.length)
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  if (cleanup.eventIds.length)
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-BOOTH-A: /api/booth-devices GET/POST ─────────────────────────────
describe("TC-BOOTH-A: /api/booth-devices — ペアリング登録・一覧・権限", () => {
  it("TC-BOOTH-A-01: artist（権限なし）がPOST → 403", async () => {
    mockAs(artistProfileId, "artist");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: deviceCodeMain, nfc_routing_id: nfcMain }),
    });
    const res = await boothDevicesPOST(req);
    expect(res.status).toBe(403);
  });

  it("TC-BOOTH-A-02: organizerがPOST → 200・upsertされる", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: deviceCodeMain, nfc_routing_id: nfcMain }),
    });
    const res = await boothDevicesPOST(req);
    expect(res.status).toBe(200);
    cleanup.deviceCodes.push(deviceCodeMain);

    const { data } = await testAdmin.from("booth_devices").select("nfc_routing_id").eq("device_code", deviceCodeMain).single();
    expect(data?.nfc_routing_id).toBe(nfcMain);
  });

  it("TC-BOOTH-A-03: 同じdevice_codeを再POST → 重複せずupdateされる", async () => {
    mockAs(organizerProfileId, "organizer");
    const newNfc = `${nfcMain}-updated`;
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: deviceCodeMain, nfc_routing_id: newNfc }),
    });
    const res = await boothDevicesPOST(req);
    expect(res.status).toBe(200);

    const { data, count } = await testAdmin.from("booth_devices").select("nfc_routing_id", { count: "exact" }).eq("device_code", deviceCodeMain);
    expect(count).toBe(1);
    expect(data?.[0]?.nfc_routing_id).toBe(newNfc);

    // 元のnfc_routing_idに戻す（以降のテストのため）
    await testAdmin.from("booth_devices").update({ nfc_routing_id: nfcMain }).eq("device_code", deviceCodeMain);
  });

  it("TC-BOOTH-A-04: device_code欠損 → 400", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nfc_routing_id: nfcMain }),
    });
    const res = await boothDevicesPOST(req);
    expect(res.status).toBe(400);
  });

  it("TC-BOOTH-A-05: GET一覧に登録したペアリングが含まれる", async () => {
    mockAs(organizerProfileId, "organizer");
    const res = await boothDevicesGET();
    expect(res.status).toBe(200);
    const data = await res.json();
    const row = data.find((d: any) => d.device_code === deviceCodeMain);
    expect(row).toBeTruthy();
    expect(row.nfc_routing_id).toBe(nfcMain);
  });

  it("TC-BOOTH-A-06: artist（権限なし）がGET → 403", async () => {
    mockAs(artistProfileId, "artist");
    const res = await boothDevicesGET();
    expect(res.status).toBe(403);
  });
});

// ── TC-BOOTH-B: /api/booth-devices/sync ─────────────────────────────────
describe("TC-BOOTH-B: /api/booth-devices/sync — QR切替連動の同期", () => {
  it("TC-BOOTH-B-01: 登録済みdevice_codeをsync → current_event_id/current_qr_config_idが更新される", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: deviceCodeMain, event_id: eventId, qr_config_id: qrConfigA }),
    });
    const res = await boothDevicesSyncPOST(req);
    expect(res.status).toBe(200);

    const { data } = await testAdmin.from("booth_devices").select("current_event_id, current_qr_config_id").eq("device_code", deviceCodeMain).single();
    expect(data?.current_event_id).toBe(eventId);
    expect(data?.current_qr_config_id).toBe(qrConfigA);
  });

  it("TC-BOOTH-B-02: 別のQRへsync → current_qr_config_idが更新される", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: deviceCodeMain, event_id: eventId, qr_config_id: qrConfigB }),
    });
    const res = await boothDevicesSyncPOST(req);
    expect(res.status).toBe(200);

    const { data } = await testAdmin.from("booth_devices").select("current_qr_config_id").eq("device_code", deviceCodeMain).single();
    expect(data?.current_qr_config_id).toBe(qrConfigB);
  });

  it("TC-BOOTH-B-03: 未登録device_codeをsync → 0件更新でも200", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: deviceCodeUnregistered, event_id: eventId, qr_config_id: qrConfigA }),
    });
    const res = await boothDevicesSyncPOST(req);
    expect(res.status).toBe(200);

    const { data } = await testAdmin.from("booth_devices").select("device_code").eq("device_code", deviceCodeUnregistered).maybeSingle();
    expect(data).toBeNull();
  });

  it("TC-BOOTH-B-04: device_code欠損 → 400", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, qr_config_id: qrConfigA }),
    });
    const res = await boothDevicesSyncPOST(req);
    expect(res.status).toBe(400);
  });

  it("TC-BOOTH-B-05: artist（権限なし）がsync → 403", async () => {
    mockAs(artistProfileId, "artist");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: deviceCodeMain, event_id: eventId, qr_config_id: qrConfigA }),
    });
    const res = await boothDevicesSyncPOST(req);
    expect(res.status).toBe(403);
  });
});

// ── TC-BOOTH-C: /r/[nfcRoutingId] — リダイレクト先解決 ──────────────────
describe("TC-BOOTH-C: /r/[nfcRoutingId] — リダイレクト先解決ロジック", () => {
  it("TC-BOOTH-C-01: 登録済み（current_qr_config_idあり） → /c/[qrConfigId]へリダイレクト", async () => {
    await expect(
      NfcRoutingPage({ params: Promise.resolve({ nfcRoutingId: nfcMain }) })
    ).rejects.toThrow(`REDIRECT:/c/${qrConfigB}`);
  });

  it("TC-BOOTH-C-02: 未登録のnfc_routing_id → /へリダイレクト", async () => {
    await expect(
      NfcRoutingPage({ params: Promise.resolve({ nfcRoutingId: nfcNotFound }) })
    ).rejects.toThrow("REDIRECT:/");
  });

  it("TC-BOOTH-C-03: 登録済みだがcurrent_qr_config_idがnull → /へリダイレクト", async () => {
    const { error } = await testAdmin.from("booth_devices").insert({
      device_code: deviceCodeNoTarget,
      nfc_routing_id: nfcNoTarget,
    });
    expect(error).toBeNull();
    cleanup.deviceCodes.push(deviceCodeNoTarget);

    await expect(
      NfcRoutingPage({ params: Promise.resolve({ nfcRoutingId: nfcNoTarget }) })
    ).rejects.toThrow("REDIRECT:/");
  });
});
