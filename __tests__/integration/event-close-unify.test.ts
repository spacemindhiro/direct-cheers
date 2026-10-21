/**
 * TC-CLOSE: イベント終了まわりの改修（2026-10-22 hotfix/event-close-unify）
 *
 * 発端：10/18の川崎集会で開催承認（キャプチャ）を押しても「要承認」のまま、終了ボタンを押していない
 * イベントは自動照合されず送金に進めなかった。調査で Amex の対面オーソリが2日で切れることも判明。
 *
 *   A. 証跡の提出は締め時刻（終了3時間後＝当日決済の受付終了）から。下書き・中止・精算済みには出せない
 *   B. タッチ決済も QR 決済と同じ受付期間（開始〜締め時刻）。テスト用QR（bypass_validity）は期間判定だけ飛ばす
 *   C. 自動照合は終了ボタンではなく締め時刻で対象を決める。開催承認前の未キャプチャはエラーにしない
 *   D. 開催承認でキャプチャ日時・開催承認日時を記録する（全件成功したときだけ承認済み）
 *   E. タッチ決済は締め時刻かオーソリから24時間の早い方で自動キャプチャ。QR自己決済（オンライン）は待つ
 *   F. 締め時刻を過ぎて証跡が未提出なら、主催者に提出依頼・担当エージェントにフォロー依頼
 *      （自主催は admin へ）。期限2日前に催促。関係者以外には届かない
 *
 * Stripe はモック（PIごとの状態を piStore で持つ）。DB は共有のローカルDBなので、cron の応答の件数ではなく
 * このテストが作った行の状態で確かめる。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertQrConfig,
  insertTransaction,
  insertProduct,
  insertEventEvidence,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// メールは送らずに、誰に何を送ったかだけ記録する
const sentEmails: { fn: string; to: string; kind?: string; audience?: string; eventId: string; deadlineLabel?: string }[] = [];
vi.mock("@/lib/email/notification", () => ({
  sendEvidenceRequestEmail: vi.fn(async (o: any) => {
    sentEmails.push({ fn: "request", to: o.to, kind: o.kind, audience: o.audience, eventId: o.eventId, deadlineLabel: o.deadlineLabel });
  }),
  sendEvidenceSubmittedEmail: vi.fn(async (o: any) => {
    sentEmails.push({ fn: "submitted", to: Array.isArray(o.to) ? o.to.join(",") : o.to, eventId: o.eventId });
  }),
}));

// ── Stripe モック ────────────────────────────────────────────────────────────
type PiState = { status: string; types: string[]; amount: number; fee?: number };
const piStore = new Map<string, PiState>();
const captureCalls: string[] = [];
vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.paymentIntents as any).retrieve = async (id: string) => {
        const p = piStore.get(id);
        if (!p) throw new Error(`No such payment_intent: '${id}'`);
        const captured = p.status === "succeeded";
        return {
          id,
          status: p.status,
          amount: p.amount,
          amount_received: captured ? p.amount : 0,
          payment_method_types: p.types,
          latest_charge: {
            id: `ch_${id}`,
            balance_transaction: captured ? { fee: p.fee ?? 0, net: p.amount - (p.fee ?? 0) } : null,
            payment_method_details: { type: p.types[0] },
          },
        };
      };
      (this.paymentIntents as any).capture = async (id: string) => {
        captureCalls.push(id);
        const p = piStore.get(id);
        if (!p || p.status !== "requires_capture") throw new Error(`cannot capture ${id}`);
        p.status = "succeeded";
        return { id, status: "succeeded" };
      };
    }
  }
  return { ...StripeModule, default: MockStripe };
});

import { createClient } from "@/lib/supabase/server";
import { POST as evidencePOST } from "@/app/api/events/[eventId]/evidence/route";
import { POST as terminalPiPOST } from "@/app/api/entrance/terminal/payment-intent/route";
import { GET as reconcileGET } from "@/app/api/cron/reconcile/route";
import { POST as captureAllPOST } from "@/app/api/admin/events/[eventId]/capture-all/route";
import { GET as touchpayCaptureGET } from "@/app/api/cron/touchpay-capture/route";
import { GET as evidenceRequestGET } from "@/app/api/cron/evidence-request/route";
import { EVIDENCE_NOTIFICATION } from "@/lib/evidence-request";

const H = 3600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(Date.now() - ms);
const later = (ms: number) => new Date(Date.now() + ms);

function mockAs(id: string, role: string) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        const q: any = {
          select: vi.fn(() => q),
          eq: vi.fn(() => q),
          single: vi.fn().mockResolvedValue({ data: { role } }),
          maybeSingle: vi.fn().mockResolvedValue({ data: { role } }),
        };
        return q;
      }
      return testAdmin.from(table);
    }),
  });
}

function cronReq(path: string) {
  const secret = process.env.CRON_SECRET ?? "test_cron_secret";
  process.env.CRON_SECRET = secret;
  return new Request(`http://localhost/api/cron/${path}`, { headers: { authorization: `Bearer ${secret}` } });
}

const ts = Date.now();
let piSeq = 0;
function newPi(state: PiState): string {
  const id = `pi_tcclose_${ts}_${++piSeq}`;
  piStore.set(id, { ...state });
  return id;
}

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  evidenceIds: [] as string[],
};

let adminId: string;
let organizerId: string;
let agentId: string;
let otherAgentId: string;
let artistId: string;
let selfAgentId: string;

async function makeEvent(p: { title: string; startAt: Date; endAt: Date; status?: string; organizer?: string; agent?: string }) {
  const id = await insertEvent({
    organizerProfileId: p.organizer ?? organizerId,
    agentId: p.agent ?? agentId,
    title: p.title,
    startAt: p.startAt,
    endAt: p.endAt,
  });
  cleanup.eventIds.push(id);
  if (p.status && p.status !== "published") await testAdmin.from("events").update({ lifecycle_status: p.status }).eq("event_id", id);
  return id;
}

async function makeQr(eventId: string, opts: { touchpay?: boolean; productId?: string; bypass?: boolean } = {}) {
  const qr = await insertQrConfig({ eventId, creatorProfileId: organizerId, recipientProfileId: organizerId, productId: opts.productId });
  cleanup.qrConfigIds.push(qr);
  if (opts.touchpay || opts.bypass) {
    await testAdmin.from("qr_configs").update({ touchpay_enabled: !!opts.touchpay, bypass_validity: !!opts.bypass }).eq("qr_config_id", qr);
  }
  return qr;
}

async function makeTx(qrConfigId: string, piId: string, opts: { createdAt?: Date; reconciled?: boolean; amount?: number } = {}) {
  const amount = opts.amount ?? 1000;
  const id = await insertTransaction({
    qrConfigId, grossAmount: amount, netAmount: amount - 140, stripeFee: 40, platformFee: 100,
    stripePaymentIntentId: piId, reconciled: opts.reconciled ?? false,
  });
  cleanup.transactionIds.push(id);
  if (opts.createdAt) await testAdmin.from("transactions").update({ created_at: opts.createdAt.toISOString() }).eq("transaction_id", id);
  return id;
}

async function txRow(id: string) {
  const { data } = await testAdmin.from("transactions").select("captured_at, reconciled_at, reconcile_error, status").eq("transaction_id", id).single();
  return data!;
}

beforeAll(async () => {
  const mk = async (role: any, name: string) => {
    const id = await insertProfile({ role, displayName: name, email: `tcclose-${name}-${ts}@test.local` });
    cleanup.profileIds.push(id);
    return id;
  };
  organizerId = await mk("organizer", "org");
  agentId = await mk("agent", "agent");
  otherAgentId = await mk("agent", "other-agent");
  artistId = await mk("artist", "artist");
  selfAgentId = await mk("agent", "self-agent");
  // 自主催イベントのフォロー依頼の送り先（いちばん古い admin）。共有DBに既存の admin がいればその人になる
  const { data: admins } = await testAdmin.from("profiles").select("profile_id").eq("role", "admin").order("created_at", { ascending: true }).limit(1);
  adminId = admins?.[0]?.profile_id ?? (await mk("admin", "admin"));
}, 60_000);

afterAll(async () => {
  const eventIds = cleanup.eventIds;
  await testAdmin.from("event_evidences").delete().in("event_id", eventIds);
  await testAdmin.from("notifications").delete().filter("metadata->>event_id", "in", `(${eventIds.join(",")})`);
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── A. 証跡の提出は締め時刻から ──────────────────────────────────────────────
describe("TC-CLOSE-A: 証跡の提出は締め時刻（終了3時間後）から", () => {
  async function submit(eventId: string) {
    mockAs(organizerId, "organizer");
    const res = await evidencePOST(new Request("http://localhost", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo_paths: [], attendance_count: 10 }),
    }), { params: Promise.resolve({ eventId }) });
    const data = await res.json();
    if (data.evidence_id) cleanup.evidenceIds.push(data.evidence_id);
    return { status: res.status, data };
  }

  it("TC-CLOSE-A-01: 終了1時間後（まだ当日決済の受付中）→ 400", async () => {
    const e = await makeEvent({ title: "TC-CLOSE-A-01", startAt: ago(5 * H), endAt: ago(1 * H) });
    const r = await submit(e);
    expect(r.status).toBe(400);
    expect(r.data.error).toBe("Event has not ended yet");
  });

  it("TC-CLOSE-A-02: 締め時刻を過ぎた公開中（終了ボタン無し）→ 200", async () => {
    const e = await makeEvent({ title: "TC-CLOSE-A-02", startAt: ago(8 * H), endAt: ago(4 * H) });
    const r = await submit(e);
    expect(r.status).toBe(200);
    const { count } = await testAdmin.from("event_evidences").select("evidence_id", { count: "exact", head: true }).eq("event_id", e);
    expect(count).toBe(1);
  });

  it.each(["cancelled", "settled", "draft", "review_requested"])("TC-CLOSE-A-03: 締め時刻後でも %s → 400・保存されない", async (status) => {
    const e = await makeEvent({ title: `TC-CLOSE-A-03 ${status}`, startAt: ago(8 * H), endAt: ago(4 * H), status });
    const r = await submit(e);
    expect(r.status).toBe(400);
    expect(r.data.error).toBe("このイベントは現在エビデンスを提出できません");
    const { count } = await testAdmin.from("event_evidences").select("evidence_id", { count: "exact", head: true }).eq("event_id", e);
    expect(count).toBe(0);
  });
});

// ── B. タッチ決済の受付期間 ──────────────────────────────────────────────────
describe("TC-CLOSE-B: タッチ決済も QR 決済と同じ受付期間", () => {
  // 期間判定を通過すると、その次の「子機が未設定」で止まる（Stripe には到達しない）
  const PASSED_WINDOW = "表示する子機が設定されていません。子機とのペアリングを行ってください";

  async function tap(eventId: string, opts: { bypass?: boolean } = {}) {
    const productId = await insertProduct({ eventId, name: "当日券", type: "entrance", paymentType: "C", minAmount: 3000, maxAmount: 3000 });
    await makeQr(eventId, { touchpay: true, productId, bypass: opts.bypass });
    mockAs(organizerId, "organizer");
    const res = await terminalPiPOST(new Request("http://localhost", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, quantity: 1 }),
    }));
    return { status: res.status, data: await res.json() };
  }

  it("TC-CLOSE-B-01: 開始前 → 400 before_event", async () => {
    const e = await makeEvent({ title: "TC-CLOSE-B-01", startAt: later(2 * H), endAt: later(6 * H) });
    const r = await tap(e);
    expect(r.status).toBe(400);
    expect(r.data.reason).toBe("before_event");
    expect(r.data.error).toBe("イベント当日からご利用いただけます");
  });

  it("TC-CLOSE-B-02: 締め時刻後 → 400 after_event（以前は受け付けていた）", async () => {
    const e = await makeEvent({ title: "TC-CLOSE-B-02", startAt: ago(8 * H), endAt: ago(4 * H) });
    const r = await tap(e);
    expect(r.status).toBe(400);
    expect(r.data.reason).toBe("after_event");
    expect(r.data.error).toBe("決済受付が終了しました");
  });

  it("TC-CLOSE-B-03: 開催中・終了後3時間以内 → 期間判定を通過", async () => {
    const e = await makeEvent({ title: "TC-CLOSE-B-03", startAt: ago(5 * H), endAt: ago(1 * H) });
    const r = await tap(e);
    expect(r.data.error).toBe(PASSED_WINDOW);
  });

  it("TC-CLOSE-B-04: テスト用QR（bypass_validity）は締め時刻後でも期間判定を飛ばす", async () => {
    const e = await makeEvent({ title: "TC-CLOSE-B-04", startAt: ago(8 * H), endAt: ago(4 * H) });
    const r = await tap(e, { bypass: true });
    expect(r.data.error).toBe(PASSED_WINDOW);
  });

  it("TC-CLOSE-B-05: テスト用QRでも中止イベントは不可（状態の判定は飛ばさない）", async () => {
    const e = await makeEvent({ title: "TC-CLOSE-B-05", startAt: ago(1 * H), endAt: later(3 * H), status: "cancelled" });
    const r = await tap(e, { bypass: true });
    expect(r.status).toBe(400);
    expect(r.data.reason).toBe("closed");
  });
});

// ── C. 自動照合は締め時刻で対象を決める ────────────────────────────────────
describe("TC-CLOSE-C: 自動照合（cron/reconcile）", () => {
  let closedOk: { e: string; tx: string };
  let inGrace: { e: string; tx: string };
  let uncapturedUnsettled: { e: string; tx: string; pi: string };
  let uncapturedSettled: { e: string; tx: string; pi: string };
  let cancelledEv: { e: string; tx: string };
  let res: any;

  beforeAll(async () => {
    const mk = async (title: string, endAgo: number, status: string, piStatus: string) => {
      const e = await makeEvent({ title, startAt: ago(endAgo + 4 * H), endAt: ago(endAgo), status });
      const qr = await makeQr(e);
      const pi = newPi({ status: piStatus, types: ["card"], amount: 1000, fee: 36 });
      const tx = await makeTx(qr, pi);
      return { e, tx, pi };
    };
    closedOk = await mk("TC-CLOSE-C 締め後・キャプチャ済み", 4 * H, "published", "succeeded");
    inGrace = await mk("TC-CLOSE-C 締め前", 1 * H, "published", "succeeded");
    uncapturedUnsettled = await mk("TC-CLOSE-C 承認待ち", 4 * H, "published", "requires_capture");
    uncapturedSettled = await mk("TC-CLOSE-C 精算済みなのに未キャプチャ", 4 * H, "settled", "requires_capture");
    cancelledEv = await mk("TC-CLOSE-C 中止", 4 * H, "cancelled", "succeeded");
    res = await (await reconcileGET(cronReq("reconcile"))).json();
  }, 60_000);

  it("TC-CLOSE-C-01: 終了ボタン無しでも締め時刻後なら照合される・イベントも照合済み", async () => {
    const tx = await txRow(closedOk.tx);
    expect(tx.reconciled_at).not.toBeNull();
    const { data: ev } = await testAdmin.from("events").select("reconciled_at").eq("event_id", closedOk.e).single();
    expect(ev!.reconciled_at).not.toBeNull();
  });

  it("TC-CLOSE-C-02: 締め時刻前・中止イベントは対象外", async () => {
    expect((await txRow(inGrace.tx)).reconciled_at).toBeNull();
    expect((await txRow(cancelledEv.tx)).reconciled_at).toBeNull();
  });

  it("TC-CLOSE-C-03: 開催承認前の未キャプチャはエラーにしない（照合ログのエラーに載らない）", async () => {
    const tx = await txRow(uncapturedUnsettled.tx);
    expect(tx.reconciled_at).toBeNull();
    expect(tx.reconcile_error).toBeNull();
    expect(res.pending_capture).toBeGreaterThanOrEqual(1);
    const { data: log } = await testAdmin.from("reconciliation_logs").select("summary").order("run_at", { ascending: false }).limit(1).single();
    const errorTxIds = ((log!.summary as any).errors ?? []).map((e: any) => e.transaction_id);
    expect(errorTxIds).not.toContain(uncapturedUnsettled.tx);
    // 精算済みイベントの未キャプチャは、従来どおり資金未回収のエラー
    expect(errorTxIds).toContain(uncapturedSettled.tx);
    const { data: ev } = await testAdmin.from("events").select("reconciled_at").eq("event_id", uncapturedUnsettled.e).single();
    expect(ev!.reconciled_at).toBeNull();
  });
});

// ── D. 開催承認でキャプチャ日時・承認日時を記録 ─────────────────────────────
describe("TC-CLOSE-D: 開催承認（capture-all）", () => {
  async function approve(eventId: string) {
    mockAs(adminId, "admin");
    const res = await captureAllPOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });
    return res.json();
  }

  it("TC-CLOSE-D-01: 全件キャプチャ → 各行の captured_at と events.capture_approved_at が入る", async () => {
    const e = await makeEvent({ title: "TC-CLOSE-D-01", startAt: ago(8 * H), endAt: ago(4 * H) });
    cleanup.evidenceIds.push(await insertEventEvidence({ eventId: e, submittedByProfileId: organizerId }));
    const qr = await makeQr(e);
    const pi1 = newPi({ status: "requires_capture", types: ["card"], amount: 1000 });
    const pi2 = newPi({ status: "requires_capture", types: ["card"], amount: 2000 });
    const tx1 = await makeTx(qr, pi1);
    const tx2 = await makeTx(qr, pi2, { amount: 2000 });
    const data = await approve(e);
    expect(data.captured).toBe(2);
    expect(data.errors).toBe(0);
    expect((await txRow(tx1)).captured_at).not.toBeNull();
    expect((await txRow(tx2)).captured_at).not.toBeNull();
    const { data: ev } = await testAdmin.from("events").select("capture_approved_at").eq("event_id", e).single();
    expect(ev!.capture_approved_at).not.toBeNull();
  });

  it("TC-CLOSE-D-02: 1件でもキャプチャできなければ承認済みにしない（成功した行だけ captured_at）", async () => {
    const e = await makeEvent({ title: "TC-CLOSE-D-02", startAt: ago(8 * H), endAt: ago(4 * H) });
    cleanup.evidenceIds.push(await insertEventEvidence({ eventId: e, submittedByProfileId: organizerId }));
    const qr = await makeQr(e);
    const okPi = newPi({ status: "requires_capture", types: ["card"], amount: 1000 });
    const ngPi = newPi({ status: "canceled", types: ["card"], amount: 1000 });
    const okTx = await makeTx(qr, okPi);
    const ngTx = await makeTx(qr, ngPi);
    const data = await approve(e);
    expect(data.captured).toBe(1);
    expect(data.errors).toBe(1);
    expect(data.errorDetails).toEqual([{ pi_id: ngPi, error: "キャプチャ不可: status=canceled" }]);
    expect((await txRow(okTx)).captured_at).not.toBeNull();
    expect((await txRow(ngTx)).captured_at).toBeNull();
    const { data: ev } = await testAdmin.from("events").select("capture_approved_at").eq("event_id", e).single();
    expect(ev!.capture_approved_at).toBeNull();
  });
});

// ── E. タッチ決済の自動キャプチャ ──────────────────────────────────────────
describe("TC-CLOSE-E: タッチ決済の自動キャプチャ（cron/touchpay-capture）", () => {
  const rows: Record<string, { tx: string; pi: string }> = {};

  beforeAll(async () => {
    // 開催中のイベント（締め時刻前）：24時間の経過だけが引き金になる
    const ongoing = await makeEvent({ title: "TC-CLOSE-E 開催中（長期）", startAt: ago(2 * D), endAt: later(1 * D) });
    const ongoingQr = await makeQr(ongoing, { touchpay: true });
    const mk = async (key: string, qr: string, state: PiState, createdAgo: number) => {
      const pi = newPi(state);
      rows[key] = { pi, tx: await makeTx(qr, pi, { createdAt: ago(createdAgo) }) };
    };
    await mk("tap25h", ongoingQr, { status: "requires_capture", types: ["card_present"], amount: 1500 }, 25 * H);
    await mk("tap1h", ongoingQr, { status: "requires_capture", types: ["card_present"], amount: 1500 }, 1 * H);
    await mk("online25h", ongoingQr, { status: "requires_capture", types: ["card"], amount: 1000 }, 25 * H);
    await mk("tapAlready", ongoingQr, { status: "succeeded", types: ["card_present"], amount: 1500 }, 25 * H);

    // 締め時刻を過ぎたイベント：24時間経っていなくてもキャプチャ
    const closed = await makeEvent({ title: "TC-CLOSE-E 締め後", startAt: ago(8 * H), endAt: ago(4 * H) });
    const closedQr = await makeQr(closed, { touchpay: true });
    await mk("tapClosed", closedQr, { status: "requires_capture", types: ["card_present"], amount: 1500 }, 5 * H);
    await mk("onlineClosed", closedQr, { status: "requires_capture", types: ["card"], amount: 1000 }, 5 * H);

    // 精算済み・中止のイベントは触らない
    const settled = await makeEvent({ title: "TC-CLOSE-E 精算済み", startAt: ago(3 * D), endAt: ago(3 * D - 4 * H), status: "settled" });
    await mk("tapSettled", await makeQr(settled, { touchpay: true }), { status: "requires_capture", types: ["card_present"], amount: 1500 }, 3 * D);
    const cancelled = await makeEvent({ title: "TC-CLOSE-E 中止", startAt: ago(3 * D), endAt: ago(3 * D - 4 * H), status: "cancelled" });
    await mk("tapCancelled", await makeQr(cancelled, { touchpay: true }), { status: "requires_capture", types: ["card_present"], amount: 1500 }, 3 * D);

    await touchpayCaptureGET(cronReq("touchpay-capture"));
  }, 60_000);

  it("TC-CLOSE-E-01: オーソリから24時間経ったタッチ決済 → キャプチャ・captured_at", async () => {
    expect(captureCalls).toContain(rows.tap25h.pi);
    expect(piStore.get(rows.tap25h.pi)!.status).toBe("succeeded");
    expect((await txRow(rows.tap25h.tx)).captured_at).not.toBeNull();
  });

  it("TC-CLOSE-E-02: 締め時刻を過ぎたイベントのタッチ決済 → 24時間前でもキャプチャ", async () => {
    expect(captureCalls).toContain(rows.tapClosed.pi);
    expect((await txRow(rows.tapClosed.tx)).captured_at).not.toBeNull();
  });

  it("TC-CLOSE-E-03: 開催中・24時間未満のタッチ決済はまだキャプチャしない（現場取消は無料のまま）", async () => {
    expect(captureCalls).not.toContain(rows.tap1h.pi);
    expect((await txRow(rows.tap1h.tx)).captured_at).toBeNull();
  });

  it("TC-CLOSE-E-04: 同じQRのQR自己決済（オンライン）は時間に関係なくキャプチャしない（開催承認を待つ）", async () => {
    expect(captureCalls).not.toContain(rows.online25h.pi);
    expect(captureCalls).not.toContain(rows.onlineClosed.pi);
    expect((await txRow(rows.online25h.tx)).captured_at).toBeNull();
    expect((await txRow(rows.onlineClosed.tx)).captured_at).toBeNull();
  });

  it("TC-CLOSE-E-05: 既にキャプチャ済みのタッチ決済 → Stripeは呼ばず captured_at だけ揃える", async () => {
    expect(captureCalls).not.toContain(rows.tapAlready.pi);
    expect((await txRow(rows.tapAlready.tx)).captured_at).not.toBeNull();
  });

  it("TC-CLOSE-E-06: 精算済み・中止のイベントは触らない", async () => {
    expect(captureCalls).not.toContain(rows.tapSettled.pi);
    expect(captureCalls).not.toContain(rows.tapCancelled.pi);
    expect((await txRow(rows.tapSettled.tx)).captured_at).toBeNull();
    expect((await txRow(rows.tapCancelled.tx)).captured_at).toBeNull();
  });
});

// ── F. 証跡提出の依頼・催促 ────────────────────────────────────────────────
describe("TC-CLOSE-F: 証跡提出の依頼・催促（cron/evidence-request）", () => {
  const ev: Record<string, string> = {};
  const emailOf = async (id: string) => (await testAdmin.auth.admin.getUserById(id)).data.user!.email!;
  const notifs = async (eventId: string) => {
    const { data } = await testAdmin.from("notifications").select("profile_id, type, is_read, body")
      .filter("metadata->>event_id", "eq", eventId).order("type");
    return data ?? [];
  };
  const run = () => evidenceRequestGET(cronReq("evidence-request"));

  beforeAll(async () => {
    const withTx = async (key: string, p: Parameters<typeof makeEvent>[0], opts: { tx?: boolean; evidence?: boolean } = {}) => {
      const e = await makeEvent(p);
      ev[key] = e;
      if (opts.tx !== false) {
        const qr = await makeQr(e);
        await makeTx(qr, newPi({ status: "requires_capture", types: ["card"], amount: 1000 }));
      }
      if (opts.evidence) cleanup.evidenceIds.push(await insertEventEvidence({ eventId: e, submittedByProfileId: organizerId }));
    };
    await withTx("normal", { title: "TC-CLOSE-F 通常", startAt: ago(8 * H), endAt: ago(4 * H) });
    await withTx("self", { title: "TC-CLOSE-F 自主催", startAt: ago(8 * H), endAt: ago(4 * H), organizer: selfAgentId, agent: selfAgentId });
    await withTx("noTx", { title: "TC-CLOSE-F 決済なし", startAt: ago(8 * H), endAt: ago(4 * H) }, { tx: false });
    await withTx("submitted", { title: "TC-CLOSE-F 提出済み", startAt: ago(8 * H), endAt: ago(4 * H) }, { evidence: true });
    await withTx("inGrace", { title: "TC-CLOSE-F 締め前", startAt: ago(5 * H), endAt: ago(1 * H) });
    await withTx("pastDeadline", { title: "TC-CLOSE-F 期限切れ", startAt: ago(8 * D), endAt: ago(8 * D - 4 * H) });
    await withTx("cancelled", { title: "TC-CLOSE-F 中止", startAt: ago(8 * H), endAt: ago(4 * H), status: "cancelled" });
    // 催促：開始から6日（期限の2日前を過ぎた）。依頼は開始1日後に送ってある
    await withTx("reminder", { title: "TC-CLOSE-F 催促", startAt: ago(6 * D), endAt: ago(6 * D - 4 * H) });
    const reqSentAt = new Date(Date.now() - 5 * D).toISOString();
    await testAdmin.from("notifications").insert([
      { profile_id: organizerId, type: EVIDENCE_NOTIFICATION.request, title: "t", body: "b", metadata: { event_id: ev.reminder }, created_at: reqSentAt },
      { profile_id: agentId, type: EVIDENCE_NOTIFICATION.requestFollow, title: "t", body: "b", metadata: { event_id: ev.reminder }, created_at: reqSentAt },
    ]);
    sentEmails.length = 0;
    await run();
  }, 90_000);

  it("TC-CLOSE-F-01: 通常のイベント → 主催者に提出依頼・担当エージェントにフォロー依頼（メールとお知らせ）", async () => {
    const n = await notifs(ev.normal);
    expect(n.map((r) => [r.profile_id, r.type])).toEqual([
      [organizerId, EVIDENCE_NOTIFICATION.request],
      [agentId, EVIDENCE_NOTIFICATION.requestFollow],
    ]);
    const mails = sentEmails.filter((m) => m.eventId === ev.normal).map((m) => [m.to, m.kind, m.audience]);
    expect(mails).toEqual([
      [await emailOf(organizerId), "request", "organizer"],
      [await emailOf(agentId), "request", "follow"],
    ]);
  });

  it("TC-CLOSE-F-02: 期限（開始＋7日）をメールに明記する", async () => {
    const { data: e } = await testAdmin.from("events").select("start_at").eq("event_id", ev.normal).single();
    const expected = new Date(new Date(e!.start_at).getTime() + 7 * D).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const mail = sentEmails.find((m) => m.eventId === ev.normal && m.audience === "organizer");
    expect(mail!.deadlineLabel).toBe(expected);
  });

  it("TC-CLOSE-F-03: エージェント自身が主催 → 主催者としてのエージェントに提出依頼・admin にフォロー依頼", async () => {
    const n = await notifs(ev.self);
    expect(n.map((r) => [r.profile_id, r.type])).toEqual([
      [selfAgentId, EVIDENCE_NOTIFICATION.request],
      [adminId, EVIDENCE_NOTIFICATION.requestFollow],
    ]);
  });

  it("TC-CLOSE-F-04: 関係者以外（他のエージェント・出演者）には届かない", async () => {
    const { count } = await testAdmin.from("notifications").select("notification_id", { count: "exact", head: true })
      .in("profile_id", [otherAgentId, artistId]).filter("metadata->>event_id", "in", `(${Object.values(ev).join(",")})`);
    expect(count).toBe(0);
    const outsiderEmails = [await emailOf(otherAgentId), await emailOf(artistId)];
    expect(sentEmails.filter((m) => outsiderEmails.includes(m.to))).toEqual([]);
  });

  it.each(["noTx", "submitted", "inGrace", "pastDeadline", "cancelled"])("TC-CLOSE-F-05: %s → 送らない", async (key) => {
    expect(await notifs(ev[key])).toEqual([]);
    expect(sentEmails.filter((m) => m.eventId === ev[key])).toEqual([]);
  });

  it("TC-CLOSE-F-06: 期限の2日前を過ぎて未提出 → 催促（主催者・担当エージェント）", async () => {
    const n = (await notifs(ev.reminder)).map((r) => [r.profile_id, r.type]);
    expect(n).toEqual(expect.arrayContaining([
      [organizerId, EVIDENCE_NOTIFICATION.reminder],
      [agentId, EVIDENCE_NOTIFICATION.reminderFollow],
    ]));
    expect(n.length).toBe(4); // 事前の依頼2件＋催促2件
    const mails = sentEmails.filter((m) => m.eventId === ev.reminder).map((m) => [m.to, m.kind, m.audience]);
    expect(mails).toEqual([
      [await emailOf(organizerId), "reminder", "organizer"],
      [await emailOf(agentId), "reminder", "follow"],
    ]);
  });

  it("TC-CLOSE-F-07: もう一度実行しても二重に送らない", async () => {
    sentEmails.length = 0;
    await run();
    expect(sentEmails.filter((m) => [ev.normal, ev.self, ev.reminder].includes(m.eventId))).toEqual([]);
    expect((await notifs(ev.normal)).length).toBe(2);
    expect((await notifs(ev.reminder)).length).toBe(4);
  });

  it("TC-CLOSE-F-08: 証跡を提出すると、依頼のお知らせは全員分が既読になる", async () => {
    mockAs(organizerId, "organizer");
    const res = await evidencePOST(new Request("http://localhost", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo_paths: [], attendance_count: 30 }),
    }), { params: Promise.resolve({ eventId: ev.normal }) });
    expect(res.status).toBe(200);
    // 提出で admin 宛ての「証跡提出」通知も増えるので、依頼の種類だけを見る
    const n = (await notifs(ev.normal)).filter((r) => r.type === EVIDENCE_NOTIFICATION.request || r.type === EVIDENCE_NOTIFICATION.requestFollow);
    expect(n.map((r) => [r.profile_id, r.is_read])).toEqual([[organizerId, true], [agentId, true]]);
  });
});
