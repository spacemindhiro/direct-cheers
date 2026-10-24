/**
 * TC-LINEUP-RM: 出演者が外れたときの QR の後始末と、QR の販売停止（2026-10-24 hotfix）
 *
 *   A. 辞退：配分はオーガナイザーへ付け替える（以前は行を消すだけで、精算でその人の割合が誰にも払われなかった）。
 *      宛先は決済がまだならオーガナイザーへ。決済があれば宛先はそのまま・販売を止める
 *   B. 主催者が外す：辞退と同じ付け替え。決済のある QR の宛先になっている人は外せない（409・変わらない）
 *   C. admin の販売停止：QR 1つ・イベントまとめて。止めている間は決済の入口が断る。admin 以外は操作できない
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile, deleteAuthUsers, insertEvent, insertEventArtist, insertProduct, insertQrConfig,
  insertQrConfigTargets, insertTransaction, ongoingEventWindow,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), getUser: vi.fn().mockResolvedValue(null) }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [], set: () => {} })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as lineupPOST } from "@/app/api/events/[eventId]/lineup/[artistId]/route";
import { PATCH as eventPATCH } from "@/app/api/events/[eventId]/route";
import { POST as stopPOST } from "@/app/api/admin/qr-sales-stop/route";
import { POST as cheersPOST } from "@/app/api/pay/cheers/route";
import { POST as reservePOST } from "@/app/api/entrance/reserve/route";

let org: string, admin: string, a1: string, a2: string;
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

const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const reject = (eventId: string, artistId: string) =>
  lineupPOST(new Request("http://localhost", json({ action: "reject" })), { params: Promise.resolve({ eventId, artistId }) });
const patchEvent = (eventId: string, body: Record<string, unknown>) =>
  eventPATCH(new Request("http://localhost", { ...json(body), method: "PATCH" }), { params: Promise.resolve({ eventId }) });
const salesStop = (body: Record<string, unknown>) => stopPOST(new Request("http://localhost", json(body)));

async function mkEvent(title: string) {
  const { startAt, endAt } = ongoingEventWindow();
  const ev = await insertEvent({ organizerProfileId: org, title, startAt, endAt });
  cleanup.eventIds.push(ev);
  await insertEventArtist({ eventId: ev, artistProfileId: a1, status: "pending" });
  await insertEventArtist({ eventId: ev, artistProfileId: a2 });
  return ev;
}
async function mkQr(ev: string, recipient: string, targets: { profileId: string; ratio: number }[], context: "artist" | "organizer" = "artist") {
  const productId = await insertProduct({ eventId: ev, name: "TC-LINEUP-RM", type: "standard", minAmount: 500, maxAmount: 3000 });
  const qr = await insertQrConfig({ eventId: ev, creatorProfileId: org, recipientProfileId: recipient, productId, recipientNameContext: context });
  await insertQrConfigTargets(qr, targets);
  return { qr, productId };
}
async function pay(qr: string) {
  await insertTransaction({ qrConfigId: qr, grossAmount: 1000, netAmount: 900, stripeFee: 40, platformFee: 60, stripePaymentIntentId: `pi_lineup_rm_${qr}_${Date.now()}` });
}
const targetsOf = async (qr: string) =>
  ((await testAdmin.from("qr_config_targets").select("profile_id, distribution_ratio").eq("qr_config_id", qr).is("deleted_at", null)).data ?? [])
    .map((t) => ({ profile_id: t.profile_id, ratio: Number(t.distribution_ratio) }))
    .sort((x, y) => x.profile_id.localeCompare(y.profile_id));
const qrRow = async (qr: string) =>
  (await testAdmin.from("qr_configs").select("recipient_profile_id, recipient_name_context, sales_stopped_reason").eq("qr_config_id", qr).single()).data;
const sorted = (rows: { profile_id: string; ratio: number }[]) => [...rows].sort((x, y) => x.profile_id.localeCompare(y.profile_id));

beforeAll(async () => {
  const ts = Date.now();
  const mk = (role: string, name: string) => insertProfile({ role: role as any, displayName: name, email: `lineuprm-${name}-${ts}@test.local` });
  [org, admin, a1, a2] = await Promise.all([mk("organizer", "org"), mk("admin", "admin"), mk("artist", "a1"), mk("artist", "a2")]);
  cleanup.profileIds.push(org, admin, a1, a2);
}, 30_000);

afterAll(async () => {
  for (const ev of cleanup.eventIds) {
    const { data: qrs } = await testAdmin.from("qr_configs").select("qr_config_id").eq("event_id", ev);
    const ids = (qrs ?? []).map((q) => q.qr_config_id);
    if (ids.length) await testAdmin.from("qr_sales_stop_logs").delete().in("qr_config_id", ids);
    await testAdmin.from("notifications").delete().eq("profile_id", org);
  }
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-LINEUP-RM-A: 辞退", () => {
  it("A-01: 決済がまだの QR は、配分も宛先もオーガナイザーへ付け替える（割合は足し合わせる）", async () => {
    const ev = await mkEvent("辞退 決済なし");
    const { qr } = await mkQr(ev, a1, [{ profileId: a1, ratio: 0.5 }, { profileId: org, ratio: 0.5 }]);
    mockAs(a1, "artist");
    expect((await reject(ev, a1)).status).toBe(200);
    expect(await targetsOf(qr)).toEqual([{ profile_id: org, ratio: 1 }]);
    expect(await qrRow(qr)).toEqual({ recipient_profile_id: org, recipient_name_context: "organizer", sales_stopped_reason: null });
  });

  it("A-02: その人だけが配分先の QR は、オーガナイザーの行を足す（配分が0にならない）。宛先がほかの人なら宛先はそのまま", async () => {
    const ev = await mkEvent("辞退 単独の配分先");
    const solo = await mkQr(ev, a1, [{ profileId: a1, ratio: 1 }]);
    const shared = await mkQr(ev, a2, [{ profileId: a2, ratio: 0.7 }, { profileId: a1, ratio: 0.3 }]);
    mockAs(a1, "artist");
    expect((await reject(ev, a1)).status).toBe(200);
    expect(await targetsOf(solo.qr)).toEqual([{ profile_id: org, ratio: 1 }]);
    expect(await targetsOf(shared.qr)).toEqual(sorted([{ profile_id: a2, ratio: 0.7 }, { profile_id: org, ratio: 0.3 }]));
    expect(await qrRow(shared.qr)).toEqual({ recipient_profile_id: a2, recipient_name_context: "artist", sales_stopped_reason: null });
  });

  it("A-03: 決済のある QR の宛先なら、宛先はそのまま・配分はオーガナイザーへ・販売を止める（記録と主催者への知らせが残る）", async () => {
    const ev = await mkEvent("辞退 決済あり");
    const { qr } = await mkQr(ev, a1, [{ profileId: a1, ratio: 1 }]);
    await pay(qr);
    mockAs(a1, "artist");
    expect((await reject(ev, a1)).status).toBe(200);
    expect(await targetsOf(qr)).toEqual([{ profile_id: org, ratio: 1 }]);
    expect(await qrRow(qr)).toEqual({ recipient_profile_id: a1, recipient_name_context: "artist", sales_stopped_reason: "lineup_declined" });
    const { data: logs } = await testAdmin.from("qr_sales_stop_logs").select("action, reason, actor_profile_id").eq("qr_config_id", qr);
    expect(logs).toEqual([{ action: "stop", reason: "lineup_declined", actor_profile_id: a1 }]);
    const { data: note } = await testAdmin.from("notifications").select("body").eq("profile_id", org).eq("type", "lineup_rejected").contains("metadata", { event_id: ev }).single();
    expect(note!.body).toBe("a1 が「辞退 決済あり」への出演を辞退しました。a1 が宛先で決済のある QR が 1 件あるため、販売を止めました。新しい QR を作って差し替えてください。");
  });
});

describe("TC-LINEUP-RM-B: 主催者が外す", () => {
  it("B-01: 外した人の配分・宛先はオーガナイザーへ付け替える", async () => {
    const ev = await mkEvent("主催者が外す");
    const { qr } = await mkQr(ev, a1, [{ profileId: a1, ratio: 0.6 }, { profileId: a2, ratio: 0.4 }]);
    mockAs(org, "organizer");
    expect((await patchEvent(ev, { artists: [{ profile_id: a2 }] })).status).toBe(200);
    expect(await targetsOf(qr)).toEqual(sorted([{ profile_id: a2, ratio: 0.4 }, { profile_id: org, ratio: 0.6 }]));
    expect(await qrRow(qr)).toEqual({ recipient_profile_id: org, recipient_name_context: "organizer", sales_stopped_reason: null });
  });

  it("B-02: 決済のある QR の宛先になっている人は外せない（409・出演者も QR も変わらない）", async () => {
    const ev = await mkEvent("外せない");
    const { qr } = await mkQr(ev, a1, [{ profileId: a1, ratio: 1 }]);
    await testAdmin.from("qr_configs").update({ label: "a1 さんへのチア" }).eq("qr_config_id", qr);
    await pay(qr);
    mockAs(org, "organizer");
    const res = await patchEvent(ev, { artists: [{ profile_id: a2 }] });
    expect([res.status, (await res.json()).error]).toEqual([409, "外そうとしている出演者が宛先の QR 「a1 さんへのチア」にすでに決済があるため、外せません。QR の販売を止める場合は運営にご連絡ください。"]);
    const { data: lineup } = await testAdmin.from("event_artists").select("artist_profile_id").eq("event_id", ev).is("deleted_at", null);
    expect((lineup ?? []).map((l) => l.artist_profile_id).sort()).toEqual([a1, a2].sort());
    expect(await targetsOf(qr)).toEqual([{ profile_id: a1, ratio: 1 }]);
    expect(await qrRow(qr)).toEqual({ recipient_profile_id: a1, recipient_name_context: "artist", sales_stopped_reason: null });
  });
});

describe("TC-LINEUP-RM-C: admin の販売停止", () => {
  it("C-01: admin が QR を止めると、チア決済の入口が断る。再開すると通る。止めた・再開した記録が残る", async () => {
    const ev = await mkEvent("admin 停止 QR");
    const { qr, productId } = await mkQr(ev, a2, [{ profileId: a2, ratio: 1 }]);
    mockAs(admin, "admin");
    expect(await (await salesStop({ action: "stop", qr_config_id: qr, note: "不正の疑い" })).json()).toEqual({ ok: true, changed: 1 });
    const cheers = () => cheersPOST(new Request("http://localhost", json({ qr_config_id: qr, product_id: productId, amount: 1000, payment_method: "card" })));
    const res = await cheers();
    expect([res.status, (await res.json()).error]).toEqual([409, "このQRコードの販売は停止しています"]);
    expect(await (await salesStop({ action: "resume", qr_config_id: qr })).json()).toEqual({ ok: true, changed: 1 });
    expect((await qrRow(qr))!.sales_stopped_reason).toBe(null);
    const { data: logs } = await testAdmin.from("qr_sales_stop_logs").select("action, reason, note, actor_profile_id").eq("qr_config_id", qr).order("created_at");
    expect(logs).toEqual([
      { action: "stop", reason: "admin", note: "不正の疑い", actor_profile_id: admin },
      { action: "resume", reason: null, note: null, actor_profile_id: admin },
    ]);
  });

  it("C-02: イベントまとめて止めると全部の QR が止まり、QR を通さず商品だけを指定した前売予約も断る", async () => {
    const ev = await mkEvent("admin 停止 イベント");
    const first = await mkQr(ev, a2, [{ profileId: a2, ratio: 1 }]);
    const entranceProduct = await insertProduct({ eventId: ev, name: "前売", type: "entrance", minAmount: 3000, maxAmount: 3000 });
    await testAdmin.from("products").update({ payment_type: "B", sales_start_at: new Date(Date.now() - 86400_000).toISOString(), sales_end_at: new Date(Date.now() + 86400_000).toISOString() }).eq("product_id", entranceProduct);
    const entranceQr = await insertQrConfig({ eventId: ev, creatorProfileId: org, recipientProfileId: org, productId: entranceProduct, recipientNameContext: "organizer" });
    mockAs(admin, "admin");
    expect(await (await salesStop({ action: "stop", event_id: ev })).json()).toEqual({ ok: true, changed: 2 });
    expect((await qrRow(first.qr))!.sales_stopped_reason).toBe("admin");
    expect((await qrRow(entranceQr))!.sales_stopped_reason).toBe("admin");
    const res = await reservePOST(new Request("http://localhost", json({ product_id: entranceProduct, customer_email: "buyer@test.local" })));
    expect([res.status, (await res.json()).error]).toEqual([409, "このQRコードの販売は停止しています"]);
  });

  it("C-03: admin 以外（主催者・出演者）は止められない（403・変わらない）", async () => {
    const ev = await mkEvent("admin 以外");
    const { qr } = await mkQr(ev, a2, [{ profileId: a2, ratio: 1 }]);
    for (const [id, role] of [[org, "organizer"], [a2, "artist"]] as const) {
      mockAs(id, role);
      expect((await salesStop({ action: "stop", qr_config_id: qr })).status).toBe(403);
    }
    expect((await qrRow(qr))!.sales_stopped_reason).toBe(null);
  });
});
