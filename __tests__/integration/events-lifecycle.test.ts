/**
 * TC-LIFECYCLE: イベントライフサイクル統合テスト
 *
 * イベントの作成 → 審査依頼 → 承認 → 中止申請 → 中止承認 の
 * 全ライフサイクルと権限チェック・ステータス遷移を網羅する。
 *
 * カバレッジ:
 *   A. events/create — 正常系・バリデーション・権限
 *   B. events/request-review — draft→review_requested、状態チェック
 *   C. events/cancel POST — 中止申請（即時 vs 申請待ち）
 *   D. events/cancel PATCH — エージェント承認/却下
 *   E. events/approve — review_requested→published（追加確認）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers, insertEvent } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      // キャンセル承認時の PI void をモック
      (this.paymentIntents as any).cancel = async (id: string) => ({
        id, status: "canceled", object: "payment_intent",
      });
    }
  }
  return { ...StripeModule, default: MockStripe };
});

import { createClient } from "@/lib/supabase/server";
import { POST as createPOST } from "@/app/api/events/create/route";
import { POST as requestReviewPOST } from "@/app/api/events/[eventId]/request-review/route";
import { POST as approvePOST } from "@/app/api/events/[eventId]/approve/route";
import { POST as cancelPOST, PATCH as cancelPATCH } from "@/app/api/events/[eventId]/cancel/route";

let adminProfileId: string;
let agentProfileId: string;
let organizerProfileId: string;
let otherOrganizerProfileId: string;
let nonOrganizerProfileId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
};

function mockAs(profileId: string, role: string, extra: Record<string, unknown> = {}) {
  (createClient as any).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: profileId } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { role, status: "active", responsible_agent_id: agentProfileId, ...extra },
          }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  adminProfileId = await insertProfile({
    role: "admin", displayName: "管理者（ライフサイクル）", email: `admin-lc-${ts}@test.local`,
  });
  agentProfileId = await insertProfile({
    role: "agent", displayName: "エージェント（ライフサイクル）", email: `agent-lc-${ts}@test.local`,
  });
  organizerProfileId = await insertProfile({
    role: "organizer", displayName: "オーガナイザー（ライフサイクル）", email: `org-lc-${ts}@test.local`,
  });
  otherOrganizerProfileId = await insertProfile({
    role: "organizer", displayName: "他オーガナイザー", email: `other-org-lc-${ts}@test.local`,
  });
  nonOrganizerProfileId = await insertProfile({
    role: "artist", displayName: "アーティスト（権限テスト用）", email: `artist-lc-${ts}@test.local`,
  });
  cleanup.profileIds.push(adminProfileId, agentProfileId, organizerProfileId, otherOrganizerProfileId, nonOrganizerProfileId);

  // organizer に responsible_agent_id を設定
  await testAdmin.from("profiles")
    .update({ responsible_agent_id: agentProfileId })
    .eq("profile_id", organizerProfileId);
  await testAdmin.from("profiles")
    .update({ responsible_agent_id: agentProfileId })
    .eq("profile_id", otherOrganizerProfileId);
}, 30_000);

afterAll(async () => {
  if (cleanup.eventIds.length)
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-LIFECYCLE-A: events/create ──────────────────────────────────────────
describe("TC-LIFECYCLE-A: events/create — イベント作成", () => {
  it("TC-LIFECYCLE-A-01: 正常作成 → draft ステータスでDB保存", async () => {
    mockAs(organizerProfileId, "organizer");

    const req = new Request("http://localhost/api/events/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "テストイベント（create）",
        venue: "テスト会場",
        start_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
        end_at: new Date(Date.now() + 7 * 86400_000 + 3600_000).toISOString(),
      }),
    });
    const res = await createPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.event_id).toBeTruthy();
    cleanup.eventIds.push(data.event_id);

    const { data: event } = await testAdmin.from("events")
      .select("lifecycle_status, agent_id")
      .eq("event_id", data.event_id).single();
    expect(event?.lifecycle_status).toBe("draft");
    expect(event?.agent_id).toBe(agentProfileId);
  });

  it("TC-LIFECYCLE-A-02: title 欠損 → 400", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost/api/events/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venue: "会場", start_at: new Date().toISOString(), end_at: new Date().toISOString() }),
    });
    const res = await createPOST(req);
    expect(res.status).toBe(400);
  });

  it("TC-LIFECYCLE-A-03: organizer 以外（artist）→ 403", async () => {
    mockAs(nonOrganizerProfileId, "artist");
    const req = new Request("http://localhost/api/events/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "NG", venue: "v", start_at: new Date().toISOString(), end_at: new Date().toISOString() }),
    });
    const res = await createPOST(req);
    expect(res.status).toBe(403);
  });

  it("TC-LIFECYCLE-A-04: responsible_agent_id なし → 400 No agent assigned", async () => {
    mockAs(organizerProfileId, "organizer", { responsible_agent_id: null });
    const req = new Request("http://localhost/api/events/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "T", venue: "V", start_at: new Date().toISOString(), end_at: new Date().toISOString() }),
    });
    const res = await createPOST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/no agent/i);
  });
});

// ── TC-LIFECYCLE-B: events/request-review ─────────────────────────────────
describe("TC-LIFECYCLE-B: events/request-review — 承認依頼", () => {
  let draftEventId: string;

  beforeAll(async () => {
    draftEventId = await insertEvent({ organizerProfileId, agentId: agentProfileId, title: "TC-LIFECYCLE-B draft" });
    await testAdmin.from("events").update({ lifecycle_status: "draft" }).eq("event_id", draftEventId);
    cleanup.eventIds.push(draftEventId);
  });

  it("TC-LIFECYCLE-B-01: draft → review_requested", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", { method: "POST" });
    const res = await requestReviewPOST(req, { params: Promise.resolve({ eventId: draftEventId }) });
    expect(res.status).toBe(200);

    const { data: ev } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", draftEventId).single();
    expect(ev?.lifecycle_status).toBe("review_requested");
  });

  it("TC-LIFECYCLE-B-02: draft でないイベント → 400", async () => {
    // 上のテストで review_requested になっている
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", { method: "POST" });
    const res = await requestReviewPOST(req, { params: Promise.resolve({ eventId: draftEventId }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/ドラフト|draft/i);
  });

  it("TC-LIFECYCLE-B-03: 別オーガナイザーによる操作 → 403", async () => {
    mockAs(otherOrganizerProfileId, "organizer");
    const req = new Request("http://localhost", { method: "POST" });
    const res = await requestReviewPOST(req, { params: Promise.resolve({ eventId: draftEventId }) });
    expect(res.status).toBe(403);
  });
});

// ── TC-LIFECYCLE-C: events/cancel POST — 中止申請 ─────────────────────────
describe("TC-LIFECYCLE-C: events/cancel POST — 中止申請", () => {
  let draftEventId: string;
  let publishedEventId: string;
  let settledEventId: string;

  beforeAll(async () => {
    draftEventId = await insertEvent({ organizerProfileId, title: "TC-LIFECYCLE-C draft" });
    await testAdmin.from("events").update({ lifecycle_status: "draft" }).eq("event_id", draftEventId);

    publishedEventId = await insertEvent({ organizerProfileId, title: "TC-LIFECYCLE-C published" });
    // published は insertEvent のデフォルト

    settledEventId = await insertEvent({ organizerProfileId, title: "TC-LIFECYCLE-C settled" });
    await testAdmin.from("events").update({ lifecycle_status: "settled" }).eq("event_id", settledEventId);

    cleanup.eventIds.push(draftEventId, publishedEventId, settledEventId);
  });

  it("TC-LIFECYCLE-C-01: draft イベントを中止 → 即時 cancelled（immediate=true）", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", { method: "POST" });
    const res = await cancelPOST(req, { params: Promise.resolve({ eventId: draftEventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.immediate).toBe(true);

    const { data: ev } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", draftEventId).single();
    expect(ev?.lifecycle_status).toBe("cancelled");
  });

  it("TC-LIFECYCLE-C-02: published イベントを中止申請 → cancellation_requested（immediate=false）", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", { method: "POST" });
    const res = await cancelPOST(req, { params: Promise.resolve({ eventId: publishedEventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.immediate).toBe(false);

    const { data: ev } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", publishedEventId).single();
    expect(ev?.lifecycle_status).toBe("cancellation_requested");
  });

  it("TC-LIFECYCLE-C-03: settled イベント → 400（中止不可）", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", { method: "POST" });
    const res = await cancelPOST(req, { params: Promise.resolve({ eventId: settledEventId }) });
    expect(res.status).toBe(400);
  });

  it("TC-LIFECYCLE-C-04: 別オーガナイザーによる中止申請 → 403", async () => {
    const anotherEvent = await insertEvent({ organizerProfileId, title: "TC-LIFECYCLE-C another" });
    cleanup.eventIds.push(anotherEvent);
    mockAs(otherOrganizerProfileId, "organizer");
    const req = new Request("http://localhost", { method: "POST" });
    const res = await cancelPOST(req, { params: Promise.resolve({ eventId: anotherEvent }) });
    expect(res.status).toBe(403);
  });
});

// ── TC-LIFECYCLE-D: events/cancel PATCH — エージェント承認/却下 ──────────────
describe("TC-LIFECYCLE-D: events/cancel PATCH — エージェント承認/却下", () => {
  let requestedEventId: string;
  let requestedEvent2Id: string;

  beforeAll(async () => {
    requestedEventId = await insertEvent({ organizerProfileId, agentId: agentProfileId, title: "TC-LIFECYCLE-D承認" });
    await testAdmin.from("events").update({ lifecycle_status: "cancellation_requested" }).eq("event_id", requestedEventId);

    requestedEvent2Id = await insertEvent({ organizerProfileId, agentId: agentProfileId, title: "TC-LIFECYCLE-D却下" });
    await testAdmin.from("events").update({ lifecycle_status: "cancellation_requested" }).eq("event_id", requestedEvent2Id);

    cleanup.eventIds.push(requestedEventId, requestedEvent2Id);
  });

  it("TC-LIFECYCLE-D-01: エージェントが承認 → cancelled", async () => {
    mockAs(agentProfileId, "agent");
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve: true }),
    });
    const res = await cancelPATCH(req, { params: Promise.resolve({ eventId: requestedEventId }) });
    expect(res.status).toBe(200);

    const { data: ev } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", requestedEventId).single();
    expect(ev?.lifecycle_status).toBe("cancelled");
  });

  it("TC-LIFECYCLE-D-02: エージェントが却下 → published に戻る", async () => {
    mockAs(agentProfileId, "agent");
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve: false }),
    });
    const res = await cancelPATCH(req, { params: Promise.resolve({ eventId: requestedEvent2Id }) });
    expect(res.status).toBe(200);

    const { data: ev } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", requestedEvent2Id).single();
    expect(ev?.lifecycle_status).toBe("published");
  });

  it("TC-LIFECYCLE-D-03: cancellation_requested でないイベントに PATCH → 400", async () => {
    // agentId を指定しないと organizer が agent_id になり 403 になるので明示的に指定
    const normalEvent = await insertEvent({ organizerProfileId, agentId: agentProfileId, title: "TC-LIFECYCLE-D normal" });
    cleanup.eventIds.push(normalEvent);
    mockAs(agentProfileId, "agent");
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve: true }),
    });
    const res = await cancelPATCH(req, { params: Promise.resolve({ eventId: normalEvent }) });
    expect(res.status).toBe(400);
  });

  it("TC-LIFECYCLE-D-04: 非エージェント（organizer）が PATCH → 403", async () => {
    mockAs(organizerProfileId, "organizer");
    const ev3 = await insertEvent({ organizerProfileId, title: "TC-LIFECYCLE-D ev3" });
    await testAdmin.from("events").update({ lifecycle_status: "cancellation_requested" }).eq("event_id", ev3);
    cleanup.eventIds.push(ev3);
    const req = new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve: true }),
    });
    const res = await cancelPATCH(req, { params: Promise.resolve({ eventId: ev3 }) });
    expect(res.status).toBe(403);
  });
});

// ── TC-LIFECYCLE-E: events/approve ─────────────────────────────────────────
describe("TC-LIFECYCLE-E: events/approve — 承認", () => {
  let reviewEventId: string;

  beforeAll(async () => {
    reviewEventId = await insertEvent({ organizerProfileId, agentId: agentProfileId, title: "TC-LIFECYCLE-E 承認テスト" });
    await testAdmin.from("events").update({ lifecycle_status: "review_requested" }).eq("event_id", reviewEventId);
    cleanup.eventIds.push(reviewEventId);
  });

  it("TC-LIFECYCLE-E-01: review_requested → published", async () => {
    mockAs(agentProfileId, "agent");
    const req = new Request("http://localhost", { method: "POST" });
    const res = await approvePOST(req, { params: Promise.resolve({ eventId: reviewEventId }) });
    expect(res.status).toBe(200);

    const { data: ev } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", reviewEventId).single();
    expect(ev?.lifecycle_status).toBe("published");
  });

  it("TC-LIFECYCLE-E-02: 承認済み（published）イベントの再承認 → 400", async () => {
    mockAs(agentProfileId, "agent");
    const req = new Request("http://localhost", { method: "POST" });
    const res = await approvePOST(req, { params: Promise.resolve({ eventId: reviewEventId }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/承認依頼中/);
  });
});
