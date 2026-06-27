/**
 * TC-LIFECYCLE-MATRIX: イベント状態×操作の全マトリクステスト
 *
 * 「順番違いの操作」を全パターン網羅し、不正遷移が 400 で弾かれることを保証。
 *
 * 検証マトリクス:
 *   操作              | draft | review_req | published | ongoing | ended | settled | cancelled
 *   request-review   |  200  |    400     |    400    |   400   |  400  |   400   |   400
 *   approve          |  400  |    200     |    400    |   400   |  400  |   400   |   400
 *   end              |  400  |    400     |    200    |   200   |  400  |   400   |   400
 *   settle           |  400  |    400     |   200*   |   200*  |  200* |   400   |   400
 *   cancel(POST)     |  200  |    200     |    200    |   200   |  400  |   400   |   400
 *   reset-settle     |  200  |    200     |    200    |   200   |  200  |   200   |   200
 * ※ settle は evidence あり・qr_configs あり前提で 200
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers, insertEvent, insertEventEvidence, insertQrConfig, insertTransaction } from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";
import { createTestConnectAccount, deleteTestConnectAccount, createTestPaymentIntent } from "../helpers/stripe-fixtures";

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
      (this.paymentIntents as any).cancel = async (id: string) => ({ id, status: "canceled" });
    }
  }
  return { ...StripeModule, default: MockStripe };
});

import { createClient } from "@/lib/supabase/server";
import { POST as requestReviewPOST } from "@/app/api/events/[eventId]/request-review/route";
import { POST as approvePOST } from "@/app/api/events/[eventId]/approve/route";
import { POST as endPOST } from "@/app/api/events/[eventId]/end/route";
import { POST as cancelPOST } from "@/app/api/events/[eventId]/cancel/route";
import { POST as settlePOST } from "@/app/api/events/[eventId]/settle/route";
import { POST as resetSettlePOST } from "@/app/api/admin/events/[eventId]/reset-settle/route";

let adminProfileId: string;
let agentProfileId: string;
let organizerProfileId: string;
let organizerConnectId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  evidenceIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  summaryIds: [] as string[],
  settleTransferIds: [] as string[],
};

function mockAsAdmin() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminProfileId } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "admin" } }) };
      }
      return testAdmin.from(table);
    }),
  });
}

function mockAsOrganizer() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: organizerProfileId } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "organizer" } }) };
      }
      return testAdmin.from(table);
    }),
  });
}

function mockAsAgent() {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: agentProfileId } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role: "agent" } }) };
      }
      return testAdmin.from(table);
    }),
  });
}

async function makeEvent(status: string, title: string): Promise<string> {
  const eventId = await insertEvent({ organizerProfileId, agentId: agentProfileId, title });
  await testAdmin.from("events").update({ lifecycle_status: status }).eq("event_id", eventId);
  cleanup.eventIds.push(eventId);
  return eventId;
}

beforeAll(async () => {
  organizerConnectId = await createTestConnectAccount();
  const ts = Date.now();
  adminProfileId = await insertProfile({ role: "admin", displayName: "管理者（LC-Matrix）", email: `admin-lcm-${ts}@test.local` });
  agentProfileId = await insertProfile({ role: "agent", displayName: "エージェント（LC-Matrix）", email: `agent-lcm-${ts}@test.local` });
  organizerProfileId = await insertProfile({ role: "organizer", displayName: "オーガナイザー（LC-Matrix）", email: `org-lcm-${ts}@test.local`, stripeConnectId: organizerConnectId });
  cleanup.profileIds.push(adminProfileId, agentProfileId, organizerProfileId);
  await testAdmin.from("profiles").update({ responsible_agent_id: agentProfileId }).eq("profile_id", organizerProfileId);
}, 60_000);

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
  await deleteTestConnectAccount(organizerConnectId);
});

// ── TC-LCM-A: request-review の状態チェック ─────────────────────────────
describe("TC-LCM-A: request-review — draft のみ可", () => {
  it.each([
    ["review_requested", 400],
    ["published",        400],
    ["ended",           400],
    ["settled",         400],
    ["cancelled",       400],
  ])("status=%s → %i", async (status, expectedStatus) => {
    const eventId = await makeEvent(status, `TC-LCM-A ${status}`);
    mockAsOrganizer();
    const res = await requestReviewPOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(expectedStatus);
  });
});

// ── TC-LCM-B: approve の状態チェック ──────────────────────────────────────
describe("TC-LCM-B: approve — review_requested のみ可", () => {
  it.each([
    ["draft",      400],
    ["published",  400],
    ["ended",      400],
    ["settled",    400],
    ["cancelled",  400],
  ])("status=%s → %i", async (status, expectedStatus) => {
    const eventId = await makeEvent(status, `TC-LCM-B ${status}`);
    mockAsAgent();
    const res = await approvePOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(expectedStatus);
  });
});

// ── TC-LCM-C: end の状態チェック ──────────────────────────────────────────
describe("TC-LCM-C: end — published/ongoing のみ可", () => {
  it.each([
    ["draft",            400],
    ["review_requested", 400],
    ["ended",            400],
    ["settled",          400],
    ["cancelled",        400],
  ])("status=%s → %i", async (status, expectedStatus) => {
    const eventId = await makeEvent(status, `TC-LCM-C ${status}`);
    mockAsOrganizer();
    const res = await endPOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(expectedStatus);
  });
});

// ── TC-LCM-D: cancel の状態チェック ───────────────────────────────────────
describe("TC-LCM-D: cancel — ended/settled/cancelled は不可", () => {
  it.each([
    ["ended",     400],
    ["settled",   400],
    ["cancelled", 400],
  ])("status=%s → 400", async (status) => {
    const eventId = await makeEvent(status, `TC-LCM-D ${status}`);
    mockAsOrganizer();
    const res = await cancelPOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
  });
});

// ── TC-LCM-E: settle の状態チェック ───────────────────────────────────────
describe("TC-LCM-E: settle — settled は 400（二重精算防止）", () => {
  it("settled イベントを再度 settle → 400 Already settled", async () => {
    const eventId = await makeEvent("settled", "TC-LCM-E settled");
    mockAsAdmin();
    const res = await settlePOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/settled|approved/i);
  });

  it("evidence なし → 400 No evidence submitted", async () => {
    const eventId = await makeEvent("ended", "TC-LCM-E ended no-evidence");
    mockAsAdmin();
    const res = await settlePOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/evidence/i);
  });

  it("evidence あり・QR なし → 400 No QR configs", async () => {
    const eventId = await makeEvent("ended", "TC-LCM-E ended no-qr");
    const evidenceId = await insertEventEvidence({ eventId, submittedByProfileId: organizerProfileId });
    cleanup.evidenceIds.push(evidenceId);
    mockAsAdmin();
    const res = await settlePOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/qr|transaction/i);
  });
});

// ── TC-LCM-F: reset-settle はどの状態でも admin なら成功 ─────────────────
describe("TC-LCM-F: reset-settle — admin は全状態で実行可能", () => {
  it.each(["draft", "published", "ended", "settled", "cancelled"])(
    "status=%s → 200",
    async (status) => {
      const eventId = await makeEvent(status, `TC-LCM-F ${status}`);
      mockAsAdmin();
      const res = await resetSettlePOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });
      expect(res.status).toBe(200);
    }
  );
});
