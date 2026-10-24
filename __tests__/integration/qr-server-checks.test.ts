/* eslint-disable @typescript-eslint/no-explicit-any -- Supabaseクライアントの偽物を最小限の形で作るため */
/**
 * TC-QR-SRV: QR の作成・編集で、これまで画面だけが確かめていたことを API も確かめる（2026-10-23）
 *   A 宛先・配分先：イベントの主催者と出演者（断った人・外された人を除く）だけ／宛先は配分先に入っていること
 *   B 前売り（エントランス×A/B）の販売期間・前売即時確定（B）の販売上限数（必須・2026-10-24）と残高
 *   C ラベル・QR画像
 *   D 編集：新しく入れる人だけ確かめ、すでに入っている人（あとで断った人）はそのまま通す／
 *     前売即時確定（B）は上限数を外せない・在庫か上限金額を増やすときは残高を確かめる（2026-10-24）
 *   E 編集の範囲（2026-10-24）：終わった・中止のイベントは変えない／決済のあとは宛先を替えない／宛先は配分先の中／
 *     代理の下書き（未送信）は名義の主催者から存在しない扱い
 * 弾いたときは products・qr_configs・qr_config_targets の行が増えない・変わらないことまで見る
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile, deleteAuthUsers, insertEvent, insertEventArtist,
  insertProduct, insertQrConfig, insertQrConfigTargets, insertTransaction, insertDistribution,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";
import { storagePublicPrefix } from "@/lib/image-source";
import { getFeeConfig } from "@/lib/fee-config";
import { organizerBalance } from "@/lib/qr/rules";
import { markProxyDraft } from "@/lib/proxy-draft";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), getUser: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("@/lib/apple-wallet-push", () => ({ pushWalletUpdateBySerial: vi.fn().mockResolvedValue(undefined) }));

import { createClient } from "@/lib/supabase/server";
import { POST as qrCreatePOST } from "@/app/api/qr/create/route";
import { PATCH as qrPATCH, DELETE as qrDELETE } from "@/app/api/qr/[qrConfigId]/route";

const IMG = `${storagePublicPrefix("qr-images")}tc-qr-srv/x.jpg`;

let org: string, confirmed: string, pending: string, rejected: string, removed: string, outsider: string, otherOrg: string;
let eventId: string, otherEventId: string;
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

const post = (body: Record<string, unknown>) =>
  qrCreatePOST(new Request("http://localhost/api/qr/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const patch = (qrConfigId: string, body: Record<string, unknown>) =>
  qrPATCH(new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ qrConfigId }) });

// 画面が送るのと同じ形の、通る入力（出演者宛て・スタンダード）
const body = (over: Record<string, unknown> = {}) => ({
  event_id: eventId, label: "TC-QR-SRV", product_type: "standard", image_url: IMG,
  min_amount: 500, max_amount: 3000,
  recipient_profile_id: confirmed, recipient_name_context: "artist",
  targets: [{ profile_id: confirmed, distribution_ratio: 1 }],
  ...over,
});

async function counts(ev = eventId) {
  const [p, q] = await Promise.all([
    testAdmin.from("products").select("product_id", { count: "exact", head: true }).eq("event_id", ev),
    testAdmin.from("qr_configs").select("qr_config_id", { count: "exact", head: true }).eq("event_id", ev),
  ]);
  return { products: p.count ?? 0, qrs: q.count ?? 0 };
}

async function expectRejected(res: Response, error: string, before: { products: number; qrs: number }) {
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe(error);
  expect(await counts()).toEqual(before);
}

beforeAll(async () => {
  const ts = Date.now();
  const mk = (role: string, name: string) => insertProfile({ role: role as any, displayName: name, email: `qrsrv-${name}-${ts}@test.local` });
  [org, confirmed, pending, rejected, removed, outsider, otherOrg] = await Promise.all([
    mk("organizer", "org"), mk("artist", "confirmed"), mk("artist", "pending"), mk("artist", "rejected"),
    mk("artist", "removed"), mk("artist", "outsider"), mk("organizer", "otherorg"),
  ]);
  cleanup.profileIds.push(org, confirmed, pending, rejected, removed, outsider, otherOrg);
  eventId = await insertEvent({ organizerProfileId: org, title: "TC-QR-SRV" });
  otherEventId = await insertEvent({ organizerProfileId: otherOrg, title: "TC-QR-SRV 別" });
  cleanup.eventIds.push(eventId, otherEventId);
  await insertEventArtist({ eventId, artistProfileId: confirmed });
  await insertEventArtist({ eventId, artistProfileId: pending, status: "pending" });
  await testAdmin.from("event_artists").insert({ event_id: eventId, artist_profile_id: rejected, status: "rejected" });
  await testAdmin.from("event_artists").insert({ event_id: eventId, artist_profile_id: removed, status: "confirmed", deleted_at: new Date().toISOString() });
  // outsider は別のイベントの出演者（このイベントには関係ない）
  await insertEventArtist({ eventId: otherEventId, artistProfileId: outsider });
}, 60_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-QR-SRV-A: 作成・宛先と配分先", () => {
  it("A-01: 出演確定・依頼中の出演者、主催者名義の主催者は作れる（画面の候補と同じ）", async () => {
    mockAs(org, "organizer");
    for (const b of [
      body(),
      body({ recipient_profile_id: pending, targets: [{ profile_id: pending, distribution_ratio: 1 }] }),
      body({ recipient_profile_id: org, recipient_name_context: "organizer", targets: [{ profile_id: org, distribution_ratio: 0.6 }, { profile_id: confirmed, distribution_ratio: 0.4 }] }),
    ]) {
      const res = await post(b);
      expect(res.status).toBe(200);
    }
  });

  it("A-02: 宛先・配分先に、関係ない人・断った人・外された人・別のイベントの主催者を入れると 400・行が増えない", async () => {
    mockAs(org, "organizer");
    const before = await counts();
    const R = "宛先はこのイベントの主催者か出演者から選んでください";
    const T = "配分先はこのイベントの主催者か出演者から選んでください";
    for (const who of [outsider, rejected, removed, otherOrg]) {
      await expectRejected(await post(body({ recipient_profile_id: who, targets: [{ profile_id: who, distribution_ratio: 1 }] })), R, before);
      await expectRejected(await post(body({ targets: [{ profile_id: confirmed, distribution_ratio: 0.5 }, { profile_id: who, distribution_ratio: 0.5 }] })), T, before);
    }
  });

  it("A-03: 名義の取り違え（出演者を主催者名義・出演していない主催者をアーティスト名義）は 400", async () => {
    mockAs(org, "organizer");
    const before = await counts();
    const R = "宛先はこのイベントの主催者か出演者から選んでください";
    await expectRejected(await post(body({ recipient_name_context: "organizer" })), R, before);
    await expectRejected(await post(body({ recipient_profile_id: org, recipient_name_context: "artist", targets: [{ profile_id: org, distribution_ratio: 1 }] })), R, before);
  });

  it("A-04: 宛先が配分先に入っていない・配分先が空・配列でない → 400", async () => {
    mockAs(org, "organizer");
    const before = await counts();
    await expectRejected(await post(body({ targets: [{ profile_id: pending, distribution_ratio: 1 }] })), "宛先を配分先に含めてください", before);
    await expectRejected(await post(body({ targets: [] })), "配分先を1人以上指定してください", before);
    await expectRejected(await post(body({ targets: { profile_id: confirmed, distribution_ratio: 1 } })), "配分先を1人以上指定してください", before);
  });
});

describe("TC-QR-SRV-B: 作成・前売りの販売期間と残高", () => {
  const entrance = (paymentType: string, over: Record<string, unknown> = {}) => body({
    product_type: "entrance", payment_type: paymentType, image_url: null, min_amount: 3000, max_amount: 3000,
    sales_start_at: "2026-11-01T00:00:00.000Z", sales_end_at: "2026-11-20T00:00:00.000Z", ...over,
  });
  const NEED = "前売り（前売事後確定／前売即時確定タイプ）は販売開始・終了日時を入力してください";

  it("B-01: A・B で販売期間が無い・片方だけ・終了が開始と同じか前・形が壊れている → 400", async () => {
    mockAs(org, "organizer");
    const before = await counts();
    for (const pt of ["A", "B"]) {
      await expectRejected(await post(entrance(pt, { sales_start_at: null, sales_end_at: null, stock_limit: null })), NEED, before);
      await expectRejected(await post(entrance(pt, { sales_end_at: null, stock_limit: null })), NEED, before);
      await expectRejected(await post(entrance(pt, { sales_end_at: "2026-11-01T00:00:00.000Z", stock_limit: null })), "販売終了日時は開始日時より後にしてください", before);
      await expectRejected(await post(entrance(pt, { sales_end_at: "2026-10-01T00:00:00.000Z", stock_limit: null })), "販売終了日時は開始日時より後にしてください", before);
      await expectRejected(await post(entrance(pt, { sales_start_at: "あした", stock_limit: null })), "販売期間の形式が正しくありません", before);
    }
  });

  it("B-02: C（当日）は販売期間なしで作れる。A は販売期間があれば作れる", async () => {
    mockAs(org, "organizer");
    expect((await post(entrance("C", { sales_start_at: null, sales_end_at: null }))).status).toBe(200);
    expect((await post(entrance("A"))).status).toBe(200);
  });

  it("B-03: B は、残高が 上限金額×在庫×手数料率 に足りなければ 400。ちょうど足りれば作れる", async () => {
    mockAs(org, "organizer");
    const rate = (await getFeeConfig()).stripe_rate;
    const required = Math.ceil(3000 * 10 * rate);
    const before = await counts();
    await expectRejected(await post(entrance("B", { stock_limit: 10 })),
      `前売即時確定タイプを利用するには残高が ¥${required.toLocaleString()} 以上必要です（現在: ¥0）`, before);

    // 凍結された分は残高に数えない
    const productId = await insertProduct({ eventId: otherEventId, name: "残高用", type: "standard", minAmount: 500, maxAmount: 500 });
    const qr = await insertQrConfig({ eventId: otherEventId, creatorProfileId: otherOrg, recipientProfileId: otherOrg, productId });
    const tx = await insertTransaction({ qrConfigId: qr, grossAmount: required, netAmount: required, stripeFee: 0, platformFee: 0, stripePaymentIntentId: `pi_qrsrv_${Date.now()}` });
    await insertDistribution({ transactionId: tx, eventId: otherEventId, profileId: org, role: "organizer", actualAmount: required, isFrozen: true });
    await expectRejected(await post(entrance("B", { stock_limit: 10 })),
      `前売即時確定タイプを利用するには残高が ¥${required.toLocaleString()} 以上必要です（現在: ¥0）`, before);

    await insertDistribution({ transactionId: tx, eventId: otherEventId, profileId: org, role: "organizer", actualAmount: required - 1 });
    await expectRejected(await post(entrance("B", { stock_limit: 10 })),
      `前売即時確定タイプを利用するには残高が ¥${required.toLocaleString()} 以上必要です（現在: ¥${(required - 1).toLocaleString()}）`, before);

    await insertDistribution({ transactionId: tx, eventId: otherEventId, profileId: org, role: "organizer", actualAmount: 1 });
    expect((await post(entrance("B", { stock_limit: 10 }))).status).toBe(200);
  });

  it("B-04: B は販売上限数が必須（無い・0・小数・文字 → 400・行が増えない）。A・C は無くても作れる", async () => {
    mockAs(org, "organizer");
    const before = await counts();
    for (const stock of [null, undefined, 0, -1, 1.5, "10"]) {
      await expectRejected(await post(entrance("B", { stock_limit: stock })), "前売即時確定タイプは販売上限数を入力してください", before);
    }
    expect((await post(entrance("A", { stock_limit: null }))).status).toBe(200);
    expect((await post(entrance("C", { stock_limit: null, sales_start_at: null, sales_end_at: null }))).status).toBe(200);
  });
});

describe("TC-QR-SRV-C: 作成・ラベルと画像", () => {
  it("C-01: ラベルが無い・空白だけ・文字列でない → 400", async () => {
    mockAs(org, "organizer");
    const before = await counts();
    for (const label of [undefined, "   ", 123]) {
      await expectRejected(await post(body({ label })), "ラベルを入力してください", before);
    }
  });

  it("C-02: スタンダード・メッセージは画像が必須。バウチャー・ドリンク・エントランスは要らない", async () => {
    mockAs(org, "organizer");
    const before = await counts();
    await expectRejected(await post(body({ image_url: null })), "QR画像をアップロードしてください", before);
    await expectRejected(await post(body({ product_type: "message", image_url: undefined })), "QR画像をアップロードしてください", before);
    expect((await post(body({ product_type: "entrance", payment_type: "C", image_url: null }))).status).toBe(200);
  });
});

describe("TC-QR-SRV-D: 編集", () => {
  async function seed(recipient: string, context: "organizer" | "artist", targets: { profileId: string; ratio: number }[]) {
    const productId = await insertProduct({ eventId, name: "編集用", type: "standard", minAmount: 500, maxAmount: 3000 });
    const qr = await insertQrConfig({ eventId, creatorProfileId: org, recipientProfileId: recipient, productId, recipientNameContext: context });
    await insertQrConfigTargets(qr, targets);
    return qr;
  }
  const activeTargets = async (qr: string) =>
    ((await testAdmin.from("qr_config_targets").select("profile_id, distribution_ratio").eq("qr_config_id", qr).is("deleted_at", null)).data ?? [])
      .map((t) => `${t.profile_id}:${Number(t.distribution_ratio)}`).sort();
  const recipientOf = async (qr: string) =>
    (await testAdmin.from("qr_configs").select("recipient_profile_id, recipient_name_context, label").eq("qr_config_id", qr).single()).data;

  it("D-01: 関係ない人・断った人を宛先や配分先に入れる → 400・宛先も配分先もラベルも変わらない", async () => {
    mockAs(org, "organizer");
    const qr = await seed(confirmed, "artist", [{ profileId: confirmed, ratio: 1 }]);
    for (const who of [outsider, rejected, otherOrg]) {
      let res = await patch(qr, { label: "変えない", recipient_profile_id: who, recipient_name_context: "artist" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("宛先はこのイベントの主催者か出演者から選んでください");
      res = await patch(qr, { label: "変えない", targets: [{ profile_id: who, distribution_ratio: 1 }] });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("配分先はこのイベントの主催者か出演者から選んでください");
    }
    expect(await recipientOf(qr)).toEqual({ recipient_profile_id: confirmed, recipient_name_context: "artist", label: null });
    expect(await activeTargets(qr)).toEqual([`${confirmed}:1`]);
  });

  it("D-02: あとで出演を断った人が宛先・配分先に入ったままでも、画面と同じ形（宛先・配分先を送り直す）でラベルを直せる", async () => {
    mockAs(org, "organizer");
    const qr = await seed(rejected, "artist", [{ profileId: rejected, ratio: 0.5 }, { profileId: confirmed, ratio: 0.5 }]);
    const res = await patch(qr, {
      label: "直した", recipient_profile_id: rejected, recipient_name_context: "artist",
      targets: [{ profile_id: rejected, distribution_ratio: 0.5 }, { profile_id: confirmed, distribution_ratio: 0.5 }],
    });
    expect(res.status).toBe(200);
    expect(await recipientOf(qr)).toEqual({ recipient_profile_id: rejected, recipient_name_context: "artist", label: "直した" });
    expect(await activeTargets(qr)).toEqual([`${confirmed}:0.5`, `${rejected}:0.5`].sort());
  });

  it("D-04: B の QR は、編集で販売上限数を外す（null）・在庫管理を OFF にすると 400・変わらない。上限数を替える・ラベルだけ直すのは通る", async () => {
    mockAs(org, "organizer");
    const productId = await insertProduct({ eventId, name: "前売B", type: "entrance", paymentType: "B", minAmount: 3000, maxAmount: 3000, stockLimit: 10, trackInventory: true });
    const qr = await insertQrConfig({ eventId, creatorProfileId: org, recipientProfileId: org, productId, recipientNameContext: "organizer" });
    await insertQrConfigTargets(qr, [{ profileId: org, ratio: 1 }]);
    const product = async () => (await testAdmin.from("products").select("stock_limit, track_inventory").eq("product_id", productId).single()).data;
    for (const over of [{ stock_limit: null }, { track_inventory: false }, { stock_limit: null, track_inventory: false }]) {
      const res = await patch(qr, { product_name: "前売B", min_amount: 3000, max_amount: 3000, ...over });
      expect([res.status, (await res.json()).error]).toEqual([400, "前売即時確定タイプは販売上限数を入力してください"]);
    }
    expect(await product()).toEqual({ stock_limit: 10, track_inventory: true });
    // 減らすのは残高を見ない
    expect((await patch(qr, { product_name: "前売B", min_amount: 3000, max_amount: 3000, stock_limit: 5, track_inventory: true })).status).toBe(200);
    expect((await patch(qr, { label: "前売入場券" })).status).toBe(200);
    expect(await product()).toEqual({ stock_limit: 5, track_inventory: true });
  });

  it("D-05: B の QR は、在庫か上限金額を増やして必要な残高が上がるとき、残高が足りなければ 400・変わらない。足りれば通る・減らすのは見ない", async () => {
    mockAs(org, "organizer");
    const rate = (await getFeeConfig()).stripe_rate;
    const need = (stock: number, max: number) => Math.ceil(max * stock * rate);
    const productId = await insertProduct({ eventId, name: "前売B2", type: "entrance", paymentType: "B", minAmount: 3000, maxAmount: 3000, stockLimit: 5, trackInventory: true });
    const qr = await insertQrConfig({ eventId, creatorProfileId: org, recipientProfileId: org, productId, recipientNameContext: "organizer" });
    await insertQrConfigTargets(qr, [{ profileId: org, ratio: 1 }]);
    const product = async () => (await testAdmin.from("products").select("stock_limit, max_amount").eq("product_id", productId).single()).data;
    // 今の残高ではまかなえない増やし方（在庫・金額）を選ぶ
    const balance = await organizerBalance(testAdmin, org);
    const bigStock = Math.floor(balance / (3000 * rate)) + 1000;
    let res = await patch(qr, { product_name: "前売B2", min_amount: 3000, max_amount: 3000, stock_limit: bigStock });
    expect([res.status, (await res.json()).error]).toEqual([400,
      `前売即時確定タイプを利用するには残高が ¥${need(bigStock, 3000).toLocaleString()} 以上必要です（現在: ¥${balance.toLocaleString()}）`]);
    const bigPrice = 30000;
    if (need(5, bigPrice) > balance) {
      res = await patch(qr, { product_name: "前売B2", min_amount: bigPrice, max_amount: bigPrice });
      expect([res.status, (await res.json()).error]).toEqual([400,
        `前売即時確定タイプを利用するには残高が ¥${need(5, bigPrice).toLocaleString()} 以上必要です（現在: ¥${balance.toLocaleString()}）`]);
    }
    expect(await product()).toEqual({ stock_limit: 5, max_amount: 3000 });
    // 残高を足すと通る（ちょうど足りる）
    const target = 50;
    const add = Math.max(0, need(target, 3000) - balance);
    if (add > 0) {
      const p2 = await insertProduct({ eventId: otherEventId, name: "残高用2", type: "standard", minAmount: 500, maxAmount: 500 });
      const q2 = await insertQrConfig({ eventId: otherEventId, creatorProfileId: otherOrg, recipientProfileId: otherOrg, productId: p2 });
      const tx = await insertTransaction({ qrConfigId: q2, grossAmount: add, netAmount: add, stripeFee: 0, platformFee: 0, stripePaymentIntentId: `pi_qrsrv_d05_${Date.now()}` });
      await insertDistribution({ transactionId: tx, eventId: otherEventId, profileId: org, role: "organizer", actualAmount: add });
    }
    expect((await patch(qr, { product_name: "前売B2", min_amount: 3000, max_amount: 3000, stock_limit: target })).status).toBe(200);
    expect(await product()).toEqual({ stock_limit: target, max_amount: 3000 });
  });

  it("D-03: 宛先・配分先をイベントの人に替えるのは通る。名義だけを取り違えた形に替えるのは 400", async () => {
    mockAs(org, "organizer");
    const qr = await seed(confirmed, "artist", [{ profileId: confirmed, ratio: 1 }]);
    let res = await patch(qr, { recipient_profile_id: pending, recipient_name_context: "artist", targets: [{ profile_id: pending, distribution_ratio: 1 }] });
    expect(res.status).toBe(200);
    res = await patch(qr, { recipient_profile_id: pending, recipient_name_context: "organizer" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("宛先はこのイベントの主催者か出演者から選んでください");
    expect(await recipientOf(qr)).toEqual({ recipient_profile_id: pending, recipient_name_context: "artist", label: null });
    expect(await activeTargets(qr)).toEqual([`${pending}:1`]);
  });
});

describe("TC-QR-SRV-E: 編集の範囲", () => {
  async function seedOn(ev: string, recipient: string, targets: { profileId: string; ratio: number }[], context: "organizer" | "artist" = "artist") {
    const productId = await insertProduct({ eventId: ev, name: "範囲用", type: "standard", minAmount: 500, maxAmount: 3000 });
    const qr = await insertQrConfig({ eventId: ev, creatorProfileId: org, recipientProfileId: recipient, productId, recipientNameContext: context });
    await insertQrConfigTargets(qr, targets);
    return qr;
  }
  const row = async (qr: string) =>
    (await testAdmin.from("qr_configs").select("label, recipient_profile_id, recipient_name_context").eq("qr_config_id", qr).single()).data;
  const status = async (res: Response) => [res.status, (await res.json()).error];

  it("E-01: 終了・精算済み・中止のイベントの QR は主催者が変えられない（400・変わらない）。宛先本人の画像の差し替えは今までどおり", async () => {
    for (const lifecycle of ["ended", "settled", "cancelled"]) {
      const ev = await insertEvent({ organizerProfileId: org, title: `TC-QR-SRV ${lifecycle}` });
      cleanup.eventIds.push(ev);
      await insertEventArtist({ eventId: ev, artistProfileId: confirmed });
      const qr = await seedOn(ev, confirmed, [{ profileId: confirmed, ratio: 1 }]);
      await testAdmin.from("events").update({ lifecycle_status: lifecycle }).eq("event_id", ev);
      mockAs(org, "organizer");
      expect(await status(await patch(qr, { label: "変えない" }))).toEqual([400, "終わった（または中止の）イベントの QR は変更できません"]);
      expect((await row(qr))!.label).toBe(null);
      mockAs(confirmed, "artist");
      expect((await patch(qr, { image_url: IMG })).status).toBe(200);
    }
  });

  it("E-02: 決済のある QR の宛先は替えられない（409・変わらない）。今の宛先を送り直してラベルを直すのは通る（編集画面の形）", async () => {
    mockAs(org, "organizer");
    const qr = await seedOn(eventId, confirmed, [{ profileId: confirmed, ratio: 0.5 }, { profileId: pending, ratio: 0.5 }]);
    await insertTransaction({ qrConfigId: qr, grossAmount: 1000, netAmount: 900, stripeFee: 40, platformFee: 60, stripePaymentIntentId: `pi_qrsrv_e02_${Date.now()}` });
    const msg = "このQRコードにはすでに決済が発生しているため宛先は変更できません。宛先を変更する場合は新しいQRコードを作成してください。";
    expect(await status(await patch(qr, { recipient_profile_id: pending, recipient_name_context: "artist" }))).toEqual([409, msg]);
    expect(await status(await patch(qr, { recipient_profile_id: org, recipient_name_context: "organizer" }))).toEqual([409, msg]);
    expect(await row(qr)).toEqual({ label: null, recipient_profile_id: confirmed, recipient_name_context: "artist" });
    expect((await patch(qr, { label: "直した", recipient_profile_id: confirmed, recipient_name_context: "artist" })).status).toBe(200);
    expect((await row(qr))!.label).toBe("直した");
  });

  it("E-03: 宛先は配分先の中の人（配分先にいない人を宛先にする・配分から宛先を外す → 400・変わらない）", async () => {
    mockAs(org, "organizer");
    const qr = await seedOn(eventId, confirmed, [{ profileId: confirmed, ratio: 1 }]);
    expect(await status(await patch(qr, { recipient_profile_id: pending, recipient_name_context: "artist" }))).toEqual([400, "宛先を配分先に含めてください"]);
    expect(await status(await patch(qr, { targets: [{ profile_id: pending, distribution_ratio: 1 }] }))).toEqual([400, "宛先を配分先に含めてください"]);
    expect(await row(qr)).toEqual({ label: null, recipient_profile_id: confirmed, recipient_name_context: "artist" });
    // 宛先と配分を一緒に替えるのは通る
    expect((await patch(qr, { recipient_profile_id: pending, recipient_name_context: "artist", targets: [{ profile_id: pending, distribution_ratio: 1 }] })).status).toBe(200);
  });

  it("E-04: 代理の下書き（未送信）の QR は、名義の主催者からは存在しない扱い（編集・削除とも 404・変わらない）。担当エージェントは変えられる", async () => {
    const agent = await insertProfile({ role: "agent", displayName: "agent", email: `qrsrv-agent-${Date.now()}@test.local` });
    cleanup.profileIds.push(agent);
    const ev = await insertEvent({ organizerProfileId: org, agentId: agent, title: "TC-QR-SRV 代理" });
    cleanup.eventIds.push(ev);
    await testAdmin.from("events").update({ lifecycle_status: "draft" }).eq("event_id", ev);
    await markProxyDraft(testAdmin, { eventId: ev, creatorId: agent, organizerId: org });
    const qr = await seedOn(ev, org, [{ profileId: org, ratio: 1 }], "organizer");
    mockAs(org, "organizer");
    expect((await patch(qr, { label: "見えない" })).status).toBe(404);
    expect((await qrDELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ qrConfigId: qr }) })).status).toBe(404);
    expect(await row(qr)).toEqual({ label: null, recipient_profile_id: org, recipient_name_context: "organizer" });
    mockAs(agent, "agent");
    expect((await patch(qr, { label: "担当が直す" })).status).toBe(200);
    await testAdmin.from("notifications").delete().filter("metadata->>event_id", "eq", ev);
  });
});
