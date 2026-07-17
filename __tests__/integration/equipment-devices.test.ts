/**
 * TC-EQUIP: 機材マスタ（equipment_devices）とホルダー（booth_holders）
 *
 * 背景: 子機のdevice_idが端末名ハッシュだったため、名前変更で別端末として
 * 二重登録される問題を機材マスタ方式で解消した。
 *
 * カバレッジ:
 *   A. ハンドシェイク: ID一致・名前一致（自己修復）・新規登録・名前衝突時の自動採番
 *   B. 機材名変更: ID不変で表示名だけ更新、UNIQUE違反は409、権限なしは403
 *   C. ホルダー: 作成・機材載せ替え・NFC変更・削除、NFC/名前の重複は409
 *   D. 表示同期(sync): 機材IDベースでホルダーの表示先が更新される
 *   E. イベント子機登録: マスタ登録済みIDはマスタ名がキャッシュされ二重登録されない
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, insertEvent, insertQrConfig, deleteAuthUsers } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { getUser } from "@/lib/supabase/server";
import { POST as handshakePOST } from "@/app/api/equipment-devices/handshake/route";
import { GET as equipmentGET } from "@/app/api/equipment-devices/route";
import { PATCH as equipmentPATCH, DELETE as equipmentDELETE } from "@/app/api/equipment-devices/[deviceId]/route";
import { POST as holdersPOST, GET as holdersGET } from "@/app/api/booth-holders/route";
import { PATCH as holderPATCH, DELETE as holderDELETE } from "@/app/api/booth-holders/[holderId]/route";
import { POST as syncPOST } from "@/app/api/booth-devices/sync/route";
import { POST as displayDevicesPOST, GET as displayDevicesGET } from "@/app/api/events/[eventId]/display-devices/route";

const ts = Date.now();
const MARK = `eq${ts}`;

let adminId: string;
let organizerId: string;
let artistId: string;
let eventId: string;

const cleanup = { profileIds: [] as string[] };

function mockAs(id: string) {
  (getUser as any).mockResolvedValue({ id, email: `${id.slice(0, 8)}@test.local` });
}

function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const p = (obj: Record<string, string>) => ({ params: Promise.resolve(obj) });

beforeAll(async () => {
  adminId = await insertProfile({ role: "admin", displayName: `機材テスト管理者${MARK}`, email: `admin-${MARK}@test.local` });
  organizerId = await insertProfile({ role: "organizer", displayName: `機材テスト主催${MARK}`, email: `org-${MARK}@test.local` });
  artistId = await insertProfile({ role: "artist", displayName: `権限なし${MARK}`, email: `artist-${MARK}@test.local` });
  cleanup.profileIds.push(adminId, organizerId, artistId);
  eventId = await insertEvent({ organizerProfileId: organizerId });
}, 30_000);

afterAll(async () => {
  // owner_profile_id は on delete restrict のため、機材を先に消してからauthユーザーを消す。
  // organizer経由の登録は所有者が「最古のadmin」（このテストのadminとは限らない）に
  // なるため、名前のMARKで拾って開発DBに残骸を残さない
  await testAdmin.from("booth_holders").delete().ilike("name", `%${MARK}%`);
  await testAdmin.from("display_devices").delete().eq("event_id", eventId);
  await testAdmin.from("equipment_devices").delete().ilike("display_name", `%${MARK}%`);
  await testAdmin.from("equipment_devices").delete().in("owner_profile_id", cleanup.profileIds);
  await testAdmin.from("qr_configs").delete().eq("event_id", eventId);
  await testAdmin.from("events").delete().eq("event_id", eventId);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── A. ハンドシェイク ──────────────────────────────────────────────────
describe("TC-EQUIP-A: 起動時ハンドシェイク", () => {
  let firstDeviceId: string;
  const firstName = `タブレット壱${MARK}`;

  it("TC-EQUIP-A-01: 新規端末は名前つきでマスタ登録され、サーバー発行IDが返る", async () => {
    mockAs(adminId);
    const res = await handshakePOST(jsonReq("/api/equipment-devices/handshake", "POST", {
      device_id: null, fallback_name: firstName,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.display_name).toBe(firstName);
    expect(body.device_id).toMatch(/^[0-9a-f-]{36}$/);
    firstDeviceId = body.device_id;

    const { data: row } = await testAdmin
      .from("equipment_devices")
      .select("display_name, owner_profile_id, last_seen_at")
      .eq("device_id", firstDeviceId)
      .single();
    expect(row!.display_name).toBe(firstName);
    expect(row!.owner_profile_id).toBe(adminId);
    expect(row!.last_seen_at).not.toBeNull();
  });

  it("TC-EQUIP-A-02: 既知のdevice_idは同じ機材として返る（新規登録されない）", async () => {
    mockAs(adminId);
    const res = await handshakePOST(jsonReq("/api/equipment-devices/handshake", "POST", {
      device_id: firstDeviceId, fallback_name: "別の名前を申告しても無視される",
    }));
    const body = await res.json();
    expect(body.device_id).toBe(firstDeviceId);
    expect(body.display_name).toBe(firstName);

    const { count } = await testAdmin
      .from("equipment_devices")
      .select("*", { count: "exact", head: true })
      .eq("display_name", firstName);
    expect(count).toBe(1);
  });

  it("TC-EQUIP-A-03: IDを失っても名前一致で同じ機材に復元される（自己修復）", async () => {
    mockAs(adminId);
    const res = await handshakePOST(jsonReq("/api/equipment-devices/handshake", "POST", {
      device_id: null, fallback_name: firstName,
    }));
    const body = await res.json();
    expect(body.device_id).toBe(firstDeviceId);
    expect(body.display_name).toBe(firstName);
  });

  it("TC-EQUIP-A-04: organizer登録時の所有者は最古のadminになる", async () => {
    mockAs(organizerId);
    const res = await handshakePOST(jsonReq("/api/equipment-devices/handshake", "POST", {
      device_id: null, fallback_name: `主催者持ち込み${MARK}`,
    }));
    const body = await res.json();
    const { data: row } = await testAdmin
      .from("equipment_devices")
      .select("owner_profile_id")
      .eq("device_id", body.device_id)
      .single();
    const { data: oldestAdmin } = await testAdmin
      .from("profiles").select("profile_id").eq("role", "admin")
      .order("created_at", { ascending: true }).limit(1).single();
    expect(row!.owner_profile_id).toBe(oldestAdmin!.profile_id);
  });

  it("TC-EQUIP-A-05: 権限なしロール（artist）は403", async () => {
    mockAs(artistId);
    const res = await handshakePOST(jsonReq("/api/equipment-devices/handshake", "POST", {
      device_id: null, fallback_name: "should-fail",
    }));
    expect(res.status).toBe(403);
  });
});

// ── B. 機材名変更 ──────────────────────────────────────────────────────
describe("TC-EQUIP-B: 機材名の変更（ID不変）", () => {
  let deviceId: string;
  const beforeName = `改名前${MARK}`;
  const afterName = `改名後${MARK}`;

  beforeAll(async () => {
    const { data } = await testAdmin
      .from("equipment_devices")
      .insert({ display_name: beforeName, owner_profile_id: adminId })
      .select("device_id").single();
    deviceId = data!.device_id;
  });

  it("TC-EQUIP-B-01: 名前を変えてもdevice_idは不変で、行は増えない", async () => {
    mockAs(adminId);
    const res = await equipmentPATCH(
      jsonReq(`/api/equipment-devices/${deviceId}`, "PATCH", { display_name: afterName }),
      p({ deviceId }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.device_id).toBe(deviceId);
    expect(body.display_name).toBe(afterName);

    const { count: oldCount } = await testAdmin
      .from("equipment_devices").select("*", { count: "exact", head: true })
      .eq("display_name", beforeName);
    expect(oldCount).toBe(0);
    const { count: newCount } = await testAdmin
      .from("equipment_devices").select("*", { count: "exact", head: true })
      .eq("display_name", afterName);
    expect(newCount).toBe(1);
  });

  it("TC-EQUIP-B-02: 既存機材と同名への変更は409", async () => {
    mockAs(adminId);
    const res = await equipmentPATCH(
      jsonReq(`/api/equipment-devices/${deviceId}`, "PATCH", { display_name: `タブレット壱${MARK}` }),
      p({ deviceId }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("同じ機材名が既に存在します");
  });

  it("TC-EQUIP-B-03: 権限なしロールは403", async () => {
    mockAs(artistId);
    const res = await equipmentPATCH(
      jsonReq(`/api/equipment-devices/${deviceId}`, "PATCH", { display_name: "x" }),
      p({ deviceId }),
    );
    expect(res.status).toBe(403);
  });

  it("TC-EQUIP-B-04: 論理削除後は一覧から消え、同名の再登録が可能になる", async () => {
    mockAs(adminId);
    const del = await equipmentDELETE(jsonReq(`/api/equipment-devices/${deviceId}`, "DELETE"), p({ deviceId }));
    expect(del.status).toBe(200);

    const listRes = await equipmentGET();
    const list = await listRes.json();
    expect(list.some((e: any) => e.device_id === deviceId)).toBe(false);

    const { data: reinserted, error } = await testAdmin
      .from("equipment_devices")
      .insert({ display_name: afterName, owner_profile_id: adminId })
      .select("device_id").single();
    expect(error).toBeNull();
    expect(reinserted!.device_id).not.toBe(deviceId);
  });
});

// ── C. ホルダー ────────────────────────────────────────────────────────
describe("TC-EQUIP-C: ホルダーの作成・載せ替え・削除", () => {
  let holderId: string;
  let devA: string;
  let devB: string;
  const holderName = `ホルダー甲${MARK}`;
  const nfcTag = `nfc-${MARK}-1`;

  beforeAll(async () => {
    const { data: a } = await testAdmin.from("equipment_devices")
      .insert({ display_name: `機材A${MARK}`, owner_profile_id: adminId }).select("device_id").single();
    const { data: b } = await testAdmin.from("equipment_devices")
      .insert({ display_name: `機材B${MARK}`, owner_profile_id: adminId }).select("device_id").single();
    devA = a!.device_id;
    devB = b!.device_id;
  });

  it("TC-EQUIP-C-01: ホルダーを作成できる", async () => {
    mockAs(adminId);
    const res = await holdersPOST(jsonReq("/api/booth-holders", "POST", { name: holderName, nfc_routing_id: nfcTag }));
    expect(res.status).toBe(200);
    const body = await res.json();
    holderId = body.holder_id;
    expect(body.name).toBe(holderName);
    expect(body.nfc_routing_id).toBe(nfcTag);
    expect(body.current_device_id).toBeNull();
  });

  it("TC-EQUIP-C-02: 同名ホルダーの作成は409", async () => {
    mockAs(adminId);
    const res = await holdersPOST(jsonReq("/api/booth-holders", "POST", { name: holderName }));
    expect(res.status).toBe(409);
  });

  it("TC-EQUIP-C-03: 機材を載せ替えられる（A→B）", async () => {
    mockAs(adminId);
    const res1 = await holderPATCH(jsonReq(`/api/booth-holders/${holderId}`, "PATCH", { current_device_id: devA }), p({ holderId }));
    expect(res1.status).toBe(200);
    const res2 = await holderPATCH(jsonReq(`/api/booth-holders/${holderId}`, "PATCH", { current_device_id: devB }), p({ holderId }));
    expect(res2.status).toBe(200);
    const body = await res2.json();
    expect(body.current_device_id).toBe(devB);
  });

  it("TC-EQUIP-C-04: 存在しない機材IDへの載せ替えは400", async () => {
    mockAs(adminId);
    const res = await holderPATCH(
      jsonReq(`/api/booth-holders/${holderId}`, "PATCH", { current_device_id: crypto.randomUUID() }),
      p({ holderId }),
    );
    expect(res.status).toBe(400);
  });

  it("TC-EQUIP-C-05: 一覧に機材名がjoinされて返る", async () => {
    mockAs(adminId);
    const res = await holdersGET();
    const list = await res.json();
    const mine = list.find((h: any) => h.holder_id === holderId);
    expect(mine.device.display_name).toBe(`機材B${MARK}`);
  });

  it("TC-EQUIP-C-06: 削除でNFC紐付けも解除され、同じNFCタグを別ホルダーで再利用できる", async () => {
    mockAs(adminId);
    const del = await holderDELETE(jsonReq(`/api/booth-holders/${holderId}`, "DELETE"), p({ holderId }));
    expect(del.status).toBe(200);

    const res = await holdersPOST(jsonReq("/api/booth-holders", "POST", { name: `ホルダー乙${MARK}`, nfc_routing_id: nfcTag }));
    expect(res.status).toBe(200);
  });
});

// ── D. 表示同期（機材IDベース） ────────────────────────────────────────
describe("TC-EQUIP-D: 子機の表示同期でホルダーの飛び先が更新される", () => {
  let deviceId: string;
  let holderId: string;

  beforeAll(async () => {
    const { data: dev } = await testAdmin.from("equipment_devices")
      .insert({ display_name: `同期機材${MARK}`, owner_profile_id: adminId }).select("device_id").single();
    deviceId = dev!.device_id;
    const { data: holder } = await testAdmin.from("booth_holders")
      .insert({ name: `同期ホルダー${MARK}`, nfc_routing_id: `nfc-${MARK}-sync`, current_device_id: deviceId })
      .select("holder_id").single();
    holderId = holder!.holder_id;
  });

  it("TC-EQUIP-D-01: device_id指定のsyncで、その機材が載るホルダーのcurrent_event/qrが更新される", async () => {
    mockAs(organizerId);
    const res = await syncPOST(jsonReq("/api/booth-devices/sync", "POST", {
      device_id: deviceId, event_id: eventId, qr_config_id: null,
    }));
    expect(res.status).toBe(200);

    const { data: row } = await testAdmin
      .from("booth_holders")
      .select("current_event_id, current_qr_config_id")
      .eq("holder_id", holderId)
      .single();
    expect(row!.current_event_id).toBe(eventId);
    expect(row!.current_qr_config_id).toBeNull();
  });

  it("TC-EQUIP-D-02: どのホルダーにも載っていない機材のsyncは0件更新で正常終了", async () => {
    mockAs(organizerId);
    const { data: lonely } = await testAdmin.from("equipment_devices")
      .insert({ display_name: `未搭載機材${MARK}`, owner_profile_id: adminId }).select("device_id").single();
    const res = await syncPOST(jsonReq("/api/booth-devices/sync", "POST", {
      device_id: lonely!.device_id, event_id: eventId, qr_config_id: null,
    }));
    expect(res.status).toBe(200);
  });
});

// ── F. NFC単体設置（機材なしホルダーの表示先手動指定） ─────────────────
describe("TC-EQUIP-F: NFC単体設置の表示先手動指定", () => {
  let holderId: string;
  let qrConfigId: string;

  beforeAll(async () => {
    qrConfigId = await insertQrConfig({
      eventId,
      creatorProfileId: organizerId,
      recipientProfileId: organizerId,
    });
    const { data: holder } = await testAdmin.from("booth_holders")
      .insert({ name: `単体NFC${MARK}`, nfc_routing_id: `nfc-${MARK}-solo` })
      .select("holder_id").single();
    holderId = holder!.holder_id;
  });

  it("TC-EQUIP-F-01: 機材なしホルダーに表示先QRを手動指定でき、イベントIDも連動する", async () => {
    mockAs(organizerId);
    const res = await holderPATCH(
      jsonReq(`/api/booth-holders/${holderId}`, "PATCH", { current_qr_config_id: qrConfigId }),
      p({ holderId }),
    );
    expect(res.status).toBe(200);

    const { data: row } = await testAdmin
      .from("booth_holders")
      .select("current_qr_config_id, current_event_id, current_device_id")
      .eq("holder_id", holderId)
      .single();
    expect(row!.current_qr_config_id).toBe(qrConfigId);
    expect(row!.current_event_id).toBe(eventId);
    expect(row!.current_device_id).toBeNull();
  });

  it("TC-EQUIP-F-02: 存在しないQRの指定は400", async () => {
    mockAs(organizerId);
    const res = await holderPATCH(
      jsonReq(`/api/booth-holders/${holderId}`, "PATCH", { current_qr_config_id: crypto.randomUUID() }),
      p({ holderId }),
    );
    expect(res.status).toBe(400);
  });

  it("TC-EQUIP-F-03: nullで指定解除するとイベントIDも同時にクリアされる", async () => {
    mockAs(organizerId);
    const res = await holderPATCH(
      jsonReq(`/api/booth-holders/${holderId}`, "PATCH", { current_qr_config_id: null }),
      p({ holderId }),
    );
    expect(res.status).toBe(200);

    const { data: row } = await testAdmin
      .from("booth_holders")
      .select("current_qr_config_id, current_event_id")
      .eq("holder_id", holderId)
      .single();
    expect(row!.current_qr_config_id).toBeNull();
    expect(row!.current_event_id).toBeNull();
  });
});

// ── E. イベント子機登録（名前はマスタが正） ────────────────────────────
describe("TC-EQUIP-E: イベントへの子機登録はマスタ名をキャッシュする", () => {
  let deviceId: string;
  const masterName = `イベント機材${MARK}`;

  beforeAll(async () => {
    const { data } = await testAdmin.from("equipment_devices")
      .insert({ display_name: masterName, owner_profile_id: adminId }).select("device_id").single();
    deviceId = data!.device_id;
  });

  it("TC-EQUIP-E-01: クライアントが古い名前を申告してもマスタ名で登録される", async () => {
    mockAs(organizerId);
    const res = await displayDevicesPOST(
      jsonReq(`/api/events/${eventId}/display-devices`, "POST", { device_id: deviceId, device_name: "古い端末名" }),
      p({ eventId }),
    );
    expect(res.status).toBe(200);

    const { data: row } = await testAdmin
      .from("display_devices")
      .select("device_name")
      .eq("event_id", eventId)
      .eq("device_id", deviceId)
      .single();
    expect(row!.device_name).toBe(masterName);
  });

  it("TC-EQUIP-E-02: 同じ機材IDで再登録しても行は増えない（二重登録の根絶）", async () => {
    mockAs(organizerId);
    await displayDevicesPOST(
      jsonReq(`/api/events/${eventId}/display-devices`, "POST", { device_id: deviceId, device_name: masterName }),
      p({ eventId }),
    );
    const { count } = await testAdmin
      .from("display_devices")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("device_id", deviceId);
    expect(count).toBe(1);

    const listRes = await displayDevicesGET(jsonReq(`/api/events/${eventId}/display-devices`, "GET"), p({ eventId }));
    const list = await listRes.json();
    const names = list.filter((d: any) => d.device_id === deviceId).map((d: any) => d.device_name);
    expect(names).toEqual([masterName]);
  });
});
