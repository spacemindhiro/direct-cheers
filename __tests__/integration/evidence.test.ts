/**
 * TC-EVIDENCE: エビデンス提出・差戻し・精算リセットの統合テスト
 *
 * settle の前提条件となる evidence フローを完全に検証する。
 * カバレッジ:
 *   A. events/evidence POST — 提出・バリデーション・権限
 *   B. events/evidence/reject POST — 差戻し・コメント必須
 *   C. admin/events/reset-settle POST — 精算リセット
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers, insertEvent, insertEventEvidence } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { createClient } from "@/lib/supabase/server";
import { POST as evidencePOST } from "@/app/api/events/[eventId]/evidence/route";
import { POST as rejectPOST } from "@/app/api/events/[eventId]/evidence/reject/route";
import { POST as resetSettlePOST } from "@/app/api/admin/events/[eventId]/reset-settle/route";

let adminProfileId: string;
let organizerProfileId: string;
let otherOrganizerProfileId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  evidenceIds: [] as string[],
  summaryIds: [] as string[],
};

function mockAs(id: string, role: string) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role } }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

beforeAll(async () => {
  const ts = Date.now();
  adminProfileId = await insertProfile({ role: "admin", displayName: "管理者（evidence）", email: `admin-ev-${ts}@test.local` });
  organizerProfileId = await insertProfile({ role: "organizer", displayName: "オーガナイザー（evidence）", email: `org-ev-${ts}@test.local` });
  otherOrganizerProfileId = await insertProfile({ role: "organizer", displayName: "他オーガナイザー（evidence）", email: `other-ev-${ts}@test.local` });
  cleanup.profileIds.push(adminProfileId, organizerProfileId, otherOrganizerProfileId);
}, 30_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-EVIDENCE-A: evidence 提出 ─────────────────────────────────────────
describe("TC-EVIDENCE-A: events/evidence POST — 提出", () => {
  it("TC-EVIDENCE-A-01: ended イベントにエビデンス提出 → 200・DB保存", async () => {
    const eventId = await insertEvent({ organizerProfileId, title: "TC-EVIDENCE-A-01" });
    cleanup.eventIds.push(eventId);
    await testAdmin.from("events").update({ lifecycle_status: "ended" }).eq("event_id", eventId);

    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo_paths: ["path/to/photo.jpg"], description: "当日の様子", attendance_count: 50 }),
    });
    const res = await evidencePOST(req, { params: Promise.resolve({ eventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.evidence_id).toBeTruthy();
    cleanup.evidenceIds.push(data.evidence_id);

    const { data: ev } = await testAdmin.from("event_evidences").select("evidence_id, attendance_count").eq("evidence_id", data.evidence_id).single();
    expect(ev?.attendance_count).toBe(50);
  });

  it("TC-EVIDENCE-A-02: 終了前イベント → 400 Event has not ended yet", async () => {
    const eventId = await insertEvent({ organizerProfileId, title: "TC-EVIDENCE-A-02" });
    cleanup.eventIds.push(eventId);
    // lifecycle_status=published、end_at=未来 → まだ終了していない

    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo_paths: [] }),
    });
    const res = await evidencePOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/ended/i);
  });

  it("TC-EVIDENCE-A-03: 別オーガナイザー → 403 Forbidden", async () => {
    const eventId = await insertEvent({ organizerProfileId, title: "TC-EVIDENCE-A-03" });
    cleanup.eventIds.push(eventId);
    await testAdmin.from("events").update({ lifecycle_status: "ended" }).eq("event_id", eventId);

    mockAs(otherOrganizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo_paths: [] }),
    });
    const res = await evidencePOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(403);
  });

  it("TC-EVIDENCE-A-04: 未認証 → 401", async () => {
    const eventId = await insertEvent({ organizerProfileId, title: "TC-EVIDENCE-A-04" });
    cleanup.eventIds.push(eventId);

    (createClient as any).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      from: vi.fn((t: string) => testAdmin.from(t)),
    });
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo_paths: [] }),
    });
    const res = await evidencePOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(401);
  });
});

// ── TC-EVIDENCE-B: evidence 差戻し ──────────────────────────────────────
describe("TC-EVIDENCE-B: events/evidence/reject POST — 差戻し", () => {
  let endedEventId: string;

  beforeAll(async () => {
    endedEventId = await insertEvent({ organizerProfileId, title: "TC-EVIDENCE-B" });
    cleanup.eventIds.push(endedEventId);
    await testAdmin.from("events").update({ lifecycle_status: "ended" }).eq("event_id", endedEventId);
    const evidenceId = await insertEventEvidence({ eventId: endedEventId, submittedByProfileId: organizerProfileId });
    cleanup.evidenceIds.push(evidenceId);
  });

  it("TC-EVIDENCE-B-01: admin が差戻し → settlement_summaries に rejected レコード作成", async () => {
    mockAs(adminProfileId, "admin");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "写真の鮮明度が不足しています。再提出してください。" }),
    });
    const res = await rejectPOST(req, { params: Promise.resolve({ eventId: endedEventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const { data: summary } = await testAdmin.from("settlement_summaries").select("is_approved_for_payout").eq("event_id", endedEventId).maybeSingle();
    expect(summary?.is_approved_for_payout).toBe(false);
    if (summary) cleanup.summaryIds.push(summary.summary_id);
  });

  it("TC-EVIDENCE-B-02: コメント欠損 → 400", async () => {
    mockAs(adminProfileId, "admin");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "" }),
    });
    const res = await rejectPOST(req, { params: Promise.resolve({ eventId: endedEventId }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/コメント/);
  });

  it("TC-EVIDENCE-B-03: 非admin → 403", async () => {
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "差戻しコメント" }),
    });
    const res = await rejectPOST(req, { params: Promise.resolve({ eventId: endedEventId }) });
    expect(res.status).toBe(403);
  });

  it("TC-EVIDENCE-B-04: settled イベントへの差戻し → 400 Already settled", async () => {
    const settledEventId = await insertEvent({ organizerProfileId, title: "TC-EVIDENCE-B-04" });
    cleanup.eventIds.push(settledEventId);
    await testAdmin.from("events").update({ lifecycle_status: "settled" }).eq("event_id", settledEventId);

    mockAs(adminProfileId, "admin");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "差戻しコメント" }),
    });
    const res = await rejectPOST(req, { params: Promise.resolve({ eventId: settledEventId }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/settled/i);
  });
});

// ── TC-EVIDENCE-C: reset-settle（精算リセット） ────────────────────────
describe("TC-EVIDENCE-C: admin/events/reset-settle — 精算リセット", () => {
  it("TC-EVIDENCE-C-01: settled イベントを ended に戻す → settlement_summaries 削除", async () => {
    const settledEventId = await insertEvent({ organizerProfileId, title: "TC-EVIDENCE-C-01" });
    cleanup.eventIds.push(settledEventId);
    await testAdmin.from("events").update({ lifecycle_status: "settled" }).eq("event_id", settledEventId);
    await testAdmin.from("settlement_summaries").insert({ event_id: settledEventId, is_approved_for_payout: true, total_gross_amount: 10000 });

    mockAs(adminProfileId, "admin");
    const req = new Request("http://localhost", { method: "POST" });
    const res = await resetSettlePOST(req, { params: Promise.resolve({ eventId: settledEventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.reset_to).toBe("ended");

    const { data: ev } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", settledEventId).single();
    expect(ev?.lifecycle_status).toBe("ended");

    const { data: summary } = await testAdmin.from("settlement_summaries").select("summary_id").eq("event_id", settledEventId).maybeSingle();
    expect(summary).toBeNull();
  });

  it("TC-EVIDENCE-C-02: 非admin → 403", async () => {
    const eventId = await insertEvent({ organizerProfileId, title: "TC-EVIDENCE-C-02" });
    cleanup.eventIds.push(eventId);
    mockAs(organizerProfileId, "organizer");
    const req = new Request("http://localhost", { method: "POST" });
    const res = await resetSettlePOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(403);
  });
});
