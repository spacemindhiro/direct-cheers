/**
 * TC-EV-EDIT: イベント・QR を変えてよい時期と、お客様がいるときの日程・会場（2026-10-24 hotfix）
 *
 *   A. 終わった（締め時刻後）・中止申請中・中止・終了・精算済みのイベントは主催者が変えられない。
 *      終わったイベントは状態が published のまま残るため、状態だけでなく締め時刻（終了＋3時間）で見る。
 *      下書き・承認待ちは売っていないので、日付が過ぎていても直せる
 *   B. お客様（決済・チケット・カード登録済みの前売予約）がいるイベントは日程・会場を変えない。タイトルは変えられる
 *   C. QR の作成・編集も締め時刻で止める（宛先本人の画像の差し替えは今までどおり）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile, deleteAuthUsers, insertEvent, insertEventArtist, insertProduct, insertQrConfig,
  insertQrConfigTargets, insertTransaction, insertTicket, insertReservation,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";
import { storagePublicPrefix } from "@/lib/image-source";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), getUser: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { PATCH as eventPATCH } from "@/app/api/events/[eventId]/route";
import { POST as qrCreatePOST } from "@/app/api/qr/create/route";
import { PATCH as qrPATCH } from "@/app/api/qr/[qrConfigId]/route";

const IMG = `${storagePublicPrefix("qr-images")}tc-ev-edit/x.jpg`;
const HOUR = 3600_000;
let org: string, artist: string;
const cleanup = { profileIds: [] as string[], eventIds: [] as string[] };

function mockAs(id: string, role: string) {
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

const patchEvent = (eventId: string, body: Record<string, unknown>) =>
  eventPATCH(new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ eventId }) });
const patchQr = (qrConfigId: string, body: Record<string, unknown>) =>
  qrPATCH(new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ qrConfigId }) });
const createQr = (body: Record<string, unknown>) =>
  qrCreatePOST(new Request("http://localhost/api/qr/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const result = async (res: Response) => [res.status, (await res.json()).error];
const eventRow = async (id: string) =>
  (await testAdmin.from("events").select("title, venue, start_at, end_at, lifecycle_status").eq("event_id", id).single()).data;

/** 終了から endedHoursAgo 時間たったイベント（負なら終了はこれから） */
async function mkEvent(title: string, endedHoursAgo: number, lifecycle = "published") {
  const end = new Date(Date.now() - endedHoursAgo * HOUR);
  const ev = await insertEvent({ organizerProfileId: org, title, startAt: new Date(end.getTime() - 3 * HOUR), endAt: end });
  cleanup.eventIds.push(ev);
  await testAdmin.from("events").update({ lifecycle_status: lifecycle, venue: "前の会場" }).eq("event_id", ev);
  await insertEventArtist({ eventId: ev, artistProfileId: artist });
  return ev;
}
async function mkQr(ev: string) {
  const productId = await insertProduct({ eventId: ev, name: "TC-EV-EDIT", type: "standard", minAmount: 500, maxAmount: 3000 });
  const qr = await insertQrConfig({ eventId: ev, creatorProfileId: org, recipientProfileId: artist, productId, recipientNameContext: "artist" });
  await insertQrConfigTargets(qr, [{ profileId: artist, ratio: 1 }]);
  return { qr, productId };
}

const CLOSED = "終わった（または中止の）イベントは編集できません";
const HAS_BUYERS = "このイベントにはすでにお客様の決済・チケットがあるため、日程・会場は変更できません。延期する場合はイベントを中止して作り直してください。";
const later = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

beforeAll(async () => {
  const ts = Date.now();
  org = await insertProfile({ role: "organizer", displayName: "org", email: `evedit-org-${ts}@test.local` });
  artist = await insertProfile({ role: "artist", displayName: "artist", email: `evedit-artist-${ts}@test.local` });
  cleanup.profileIds.push(org, artist);
}, 30_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-EV-EDIT-A: 変えてよい時期", () => {
  it("A-01: 締め時刻（終了＋3時間）を過ぎた公開済みのイベントは、タイトルも日程も変えられない（400・変わらない・下書きに戻らない）", async () => {
    const ev = await mkEvent("締め時刻後", 4);
    const before = await eventRow(ev);
    mockAs(org, "organizer");
    expect(await result(await patchEvent(ev, { title: "変えない" }))).toEqual([400, CLOSED]);
    expect(await result(await patchEvent(ev, { start_at: later(48), end_at: later(51) }))).toEqual([400, CLOSED]);
    expect(await eventRow(ev)).toEqual(before);
    expect(before!.lifecycle_status).toBe("published");
  });

  it("A-02: 中止申請中・中止・終了・精算済みは変えられない（中止申請中に日程を変えて下書きに戻り、申請が消えることがない）", async () => {
    mockAs(org, "organizer");
    for (const lifecycle of ["cancellation_requested", "cancelled", "ended", "settled"]) {
      const ev = await mkEvent(`状態 ${lifecycle}`, -24, lifecycle);
      const before = await eventRow(ev);
      expect(await result(await patchEvent(ev, { start_at: later(48), end_at: later(51) }))).toEqual([400, CLOSED]);
      expect(await eventRow(ev)).toEqual(before);
    }
  });

  it("A-03: 締め時刻の前（終了から2時間）はまだ変えられる。下書き・承認待ちは日付が過ぎていても直せる", async () => {
    mockAs(org, "organizer");
    const inGrace = await mkEvent("終了2時間後", 2);
    expect((await patchEvent(inGrace, { title: "直した" })).status).toBe(200);
    expect((await eventRow(inGrace))!.title).toBe("直した");
    for (const lifecycle of ["draft", "review_requested"]) {
      const ev = await mkEvent(`過去の ${lifecycle}`, 48, lifecycle);
      expect((await patchEvent(ev, { start_at: later(48), end_at: later(51) })).status).toBe(200);
      expect((await eventRow(ev))!.start_at).not.toBe(null);
    }
  });
});

describe("TC-EV-EDIT-B: お客様がいるときの日程・会場", () => {
  it("B-01: QR の決済があると日程・会場は変えられない（409・変わらない・販売が止まらない）。タイトルは変えられる", async () => {
    const ev = await mkEvent("決済あり", -24);
    const { qr } = await mkQr(ev);
    await insertTransaction({ qrConfigId: qr, grossAmount: 1000, netAmount: 900, stripeFee: 40, platformFee: 60, stripePaymentIntentId: `pi_evedit_b01_${Date.now()}` });
    const before = await eventRow(ev);
    mockAs(org, "organizer");
    expect(await result(await patchEvent(ev, { start_at: later(48), end_at: later(51) }))).toEqual([409, HAS_BUYERS]);
    expect(await result(await patchEvent(ev, { venue: "別の会場" }))).toEqual([409, HAS_BUYERS]);
    expect(await eventRow(ev)).toEqual(before);
    expect((await patchEvent(ev, { title: "タイトルだけ直す" })).status).toBe(200);
    expect(await eventRow(ev)).toEqual({ ...before, title: "タイトルだけ直す" });
  });

  it("B-02: チケット・カード登録済みの前売予約でも止める。カード登録の途中（pending）だけなら変えられる", async () => {
    mockAs(org, "organizer");
    const withTicket = await mkEvent("チケットあり", -24);
    const p1 = await insertProduct({ eventId: withTicket, name: "入場", type: "entrance", minAmount: 3000, maxAmount: 3000 });
    await insertTicket({ eventId: withTicket, productId: p1 });
    expect(await result(await patchEvent(withTicket, { start_at: later(48), end_at: later(51) }))).toEqual([409, HAS_BUYERS]);

    const withReservation = await mkEvent("前売予約あり", -24);
    const p2 = await insertProduct({ eventId: withReservation, name: "前売", type: "entrance", minAmount: 3000, maxAmount: 3000 });
    await insertReservation({ eventId: withReservation, productId: p2, stripeCustomerId: "cus_evedit", stripeSetupIntentId: `seti_evedit_r_${Date.now()}`, status: "reserved" });
    expect(await result(await patchEvent(withReservation, { start_at: later(48), end_at: later(51) }))).toEqual([409, HAS_BUYERS]);

    const onlyPending = await mkEvent("予約の途中だけ", -24);
    const p3 = await insertProduct({ eventId: onlyPending, name: "前売", type: "entrance", minAmount: 3000, maxAmount: 3000 });
    await insertReservation({ eventId: onlyPending, productId: p3, stripeCustomerId: "cus_evedit", stripeSetupIntentId: `seti_evedit_p_${Date.now()}`, status: "pending" });
    expect((await patchEvent(onlyPending, { start_at: later(48), end_at: later(51) })).status).toBe(200);
  });
});

describe("TC-EV-EDIT-C: QR も締め時刻で止める", () => {
  it("C-01: 締め時刻を過ぎた公開済みのイベントの QR は作れない・変えられない（400・変わらない）。宛先本人の画像の差し替えは今までどおり", async () => {
    const ev = await mkEvent("QR 締め時刻後", 4);
    const { qr } = await mkQr(ev);
    mockAs(org, "organizer");
    expect(await result(await patchQr(qr, { label: "変えない" }))).toEqual([400, "終わった（または中止の）イベントの QR は変更できません"]);
    expect((await testAdmin.from("qr_configs").select("label").eq("qr_config_id", qr).single()).data!.label).toBe(null);
    const before = (await testAdmin.from("qr_configs").select("qr_config_id", { count: "exact", head: true }).eq("event_id", ev)).count;
    expect(await result(await createQr({
      event_id: ev, label: "作らない", product_type: "standard", image_url: IMG, min_amount: 500, max_amount: 3000,
      recipient_profile_id: artist, recipient_name_context: "artist", targets: [{ profile_id: artist, distribution_ratio: 1 }],
    }))).toEqual([400, "このイベントではQRを作成できません"]);
    expect((await testAdmin.from("qr_configs").select("qr_config_id", { count: "exact", head: true }).eq("event_id", ev)).count).toBe(before);
    mockAs(artist, "artist");
    expect((await patchQr(qr, { image_url: IMG })).status).toBe(200);
  });
});
