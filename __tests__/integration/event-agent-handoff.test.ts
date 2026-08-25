/**
 * TC-HANDOFF: 代打（エージェント引き継ぎ）統合テスト
 *
 * 現担当エージェントが別のアクティブなエージェントへイベント担当を
 * 引き継げる機能。承諾があって初めて events.agent_id が更新される。
 *
 * カバレッジ:
 *   A. handoff POST — 代打依頼の作成・権限・状態チェック
 *   B. handoff PATCH — 承諾/却下
 *   C. handoff DELETE — 依頼元による取消
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

import { createClient } from "@/lib/supabase/server";
import { POST as handoffPOST, PATCH as handoffPATCH, DELETE as handoffDELETE } from "@/app/api/events/[eventId]/handoff/route";

let organizerProfileId: string;
let agentAProfileId: string; // 現担当（依頼元）
let agentBProfileId: string; // 代打候補（アクティブ）
let agentCProfileId: string; // 無関係の第三エージェント
let inactiveAgentProfileId: string; // status != active な候補
let artistProfileId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
};

function mockAs(id: string, role: string) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role, display_name: "テスト", organizer_name: null } }),
        };
      }
      return testAdmin.from(table);
    }),
  });
}

async function insertPendingHandoffEvent(status: string) {
  const eventId = await insertEvent({ organizerProfileId, agentId: agentAProfileId, title: `TC-HANDOFF ${status}` });
  await testAdmin.from("events").update({ lifecycle_status: status }).eq("event_id", eventId);
  cleanup.eventIds.push(eventId);
  return eventId;
}

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({ role: "organizer", displayName: "オーガナイザー（代打）", email: `org-ho-${ts}@test.local` });
  agentAProfileId = await insertProfile({ role: "agent", displayName: "エージェントA", email: `agent-a-ho-${ts}@test.local` });
  agentBProfileId = await insertProfile({ role: "agent", displayName: "エージェントB", email: `agent-b-ho-${ts}@test.local` });
  agentCProfileId = await insertProfile({ role: "agent", displayName: "エージェントC", email: `agent-c-ho-${ts}@test.local` });
  inactiveAgentProfileId = await insertProfile({ role: "agent", displayName: "休止中エージェント", email: `agent-inactive-ho-${ts}@test.local` });
  artistProfileId = await insertProfile({ role: "artist", displayName: "アーティスト（権限テスト）", email: `artist-ho-${ts}@test.local` });
  cleanup.profileIds.push(
    organizerProfileId, agentAProfileId, agentBProfileId, agentCProfileId, inactiveAgentProfileId, artistProfileId,
  );

  await testAdmin.from("profiles").update({ status: "rejected" }).eq("profile_id", inactiveAgentProfileId);
}, 30_000);

afterAll(async () => {
  if (cleanup.eventIds.length)
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── TC-HANDOFF-A: POST — 代打依頼の作成 ────────────────────────────────
describe("TC-HANDOFF-A: handoff POST — 代打依頼の作成", () => {
  it("TC-HANDOFF-A-01: 現担当エージェントが依頼 → pending行がDBに作成される", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(agentAProfileId, "agent");

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_agent_id: agentBProfileId }),
    });
    const res = await handoffPOST(req, { params: Promise.resolve({ eventId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.handoff_id).toBeTruthy();

    const { data: row } = await testAdmin.from("event_agent_handoffs")
      .select("status, from_agent_id, to_agent_id")
      .eq("handoff_id", data.handoff_id).single();
    expect(row?.status).toBe("pending");
    expect(row?.from_agent_id).toBe(agentAProfileId);
    expect(row?.to_agent_id).toBe(agentBProfileId);

    // events.agent_id はまだ変わらない（承諾するまで）
    const { data: ev } = await testAdmin.from("events").select("agent_id").eq("event_id", eventId).single();
    expect(ev?.agent_id).toBe(agentAProfileId);
  });

  it("TC-HANDOFF-A-02: 担当ではないエージェント（C）が依頼 → 403", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(agentCProfileId, "agent");

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_agent_id: agentBProfileId }),
    });
    const res = await handoffPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(403);
  });

  it("TC-HANDOFF-A-03: オーガナイザーが依頼 → 403", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(organizerProfileId, "organizer");

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_agent_id: agentBProfileId }),
    });
    const res = await handoffPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(403);
  });

  it("TC-HANDOFF-A-04: draft ステータスのイベント → 400", async () => {
    const eventId = await insertPendingHandoffEvent("draft");
    mockAs(agentAProfileId, "agent");

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_agent_id: agentBProfileId }),
    });
    const res = await handoffPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
  });

  it("TC-HANDOFF-A-05: 既にpending中の依頼がある状態で再依頼 → 409", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(agentAProfileId, "agent");

    const req1 = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_agent_id: agentBProfileId }),
    });
    const res1 = await handoffPOST(req1, { params: Promise.resolve({ eventId }) });
    expect(res1.status).toBe(200);

    const req2 = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_agent_id: agentCProfileId }),
    });
    const res2 = await handoffPOST(req2, { params: Promise.resolve({ eventId }) });
    expect(res2.status).toBe(409);
  });

  it("TC-HANDOFF-A-06: 依頼先がactiveでないエージェント → 400", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(agentAProfileId, "agent");

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_agent_id: inactiveAgentProfileId }),
    });
    const res = await handoffPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
  });

  it("TC-HANDOFF-A-07: 依頼先がagentロールでない（artist）→ 400", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(agentAProfileId, "agent");

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_agent_id: artistProfileId }),
    });
    const res = await handoffPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
  });

  it("TC-HANDOFF-A-08: 自分自身への依頼 → 400", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(agentAProfileId, "agent");

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_agent_id: agentAProfileId }),
    });
    const res = await handoffPOST(req, { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
  });
});

// ── TC-HANDOFF-B: PATCH — 承諾/却下 ────────────────────────────────────
describe("TC-HANDOFF-B: handoff PATCH — 承諾/却下", () => {
  it("TC-HANDOFF-B-01: 代打先が承諾 → events.agent_idが更新される", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(agentAProfileId, "agent");
    const createRes = await handoffPOST(
      new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_agent_id: agentBProfileId }) }),
      { params: Promise.resolve({ eventId }) },
    );
    const { handoff_id } = await createRes.json();

    mockAs(agentBProfileId, "agent");
    const res = await handoffPATCH(
      new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoff_id, action: "accept" }) }),
      { params: Promise.resolve({ eventId }) },
    );
    expect(res.status).toBe(200);

    const { data: ev } = await testAdmin.from("events").select("agent_id").eq("event_id", eventId).single();
    expect(ev?.agent_id).toBe(agentBProfileId);

    const { data: row } = await testAdmin.from("event_agent_handoffs").select("status").eq("handoff_id", handoff_id).single();
    expect(row?.status).toBe("accepted");
  });

  it("TC-HANDOFF-B-02: 代打先が却下 → events.agent_idは元のまま", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(agentAProfileId, "agent");
    const createRes = await handoffPOST(
      new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_agent_id: agentBProfileId }) }),
      { params: Promise.resolve({ eventId }) },
    );
    const { handoff_id } = await createRes.json();

    mockAs(agentBProfileId, "agent");
    const res = await handoffPATCH(
      new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoff_id, action: "reject" }) }),
      { params: Promise.resolve({ eventId }) },
    );
    expect(res.status).toBe(200);

    const { data: ev } = await testAdmin.from("events").select("agent_id").eq("event_id", eventId).single();
    expect(ev?.agent_id).toBe(agentAProfileId);

    const { data: row } = await testAdmin.from("event_agent_handoffs").select("status").eq("handoff_id", handoff_id).single();
    expect(row?.status).toBe("rejected");
  });

  it("TC-HANDOFF-B-03: 代打先本人以外（依頼元）が承諾しようとする → 403", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(agentAProfileId, "agent");
    const createRes = await handoffPOST(
      new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_agent_id: agentBProfileId }) }),
      { params: Promise.resolve({ eventId }) },
    );
    const { handoff_id } = await createRes.json();

    // 依頼元本人が代わりに承諾しようとする
    mockAs(agentAProfileId, "agent");
    const res = await handoffPATCH(
      new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoff_id, action: "accept" }) }),
      { params: Promise.resolve({ eventId }) },
    );
    expect(res.status).toBe(403);
  });

  it("TC-HANDOFF-B-04: 既に承諾済みの依頼へ再度PATCH → 400", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(agentAProfileId, "agent");
    const createRes = await handoffPOST(
      new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_agent_id: agentBProfileId }) }),
      { params: Promise.resolve({ eventId }) },
    );
    const { handoff_id } = await createRes.json();

    mockAs(agentBProfileId, "agent");
    await handoffPATCH(
      new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoff_id, action: "accept" }) }),
      { params: Promise.resolve({ eventId }) },
    );

    const res = await handoffPATCH(
      new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoff_id, action: "reject" }) }),
      { params: Promise.resolve({ eventId }) },
    );
    expect(res.status).toBe(400);
  });
});

// ── TC-HANDOFF-C: DELETE — 依頼元による取消 ─────────────────────────────
describe("TC-HANDOFF-C: handoff DELETE — 依頼取消", () => {
  it("TC-HANDOFF-C-01: 依頼元が取消 → statusがcancelledになり再依頼できる", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(agentAProfileId, "agent");
    const createRes = await handoffPOST(
      new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_agent_id: agentBProfileId }) }),
      { params: Promise.resolve({ eventId }) },
    );
    const { handoff_id } = await createRes.json();

    const delRes = await handoffDELETE(
      new Request("http://localhost", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoff_id }) }),
      { params: Promise.resolve({ eventId }) },
    );
    expect(delRes.status).toBe(200);

    const { data: row } = await testAdmin.from("event_agent_handoffs").select("status").eq("handoff_id", handoff_id).single();
    expect(row?.status).toBe("cancelled");

    // pendingが解消されたので同じイベントに再依頼できる
    const retryRes = await handoffPOST(
      new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_agent_id: agentCProfileId }) }),
      { params: Promise.resolve({ eventId }) },
    );
    expect(retryRes.status).toBe(200);
  });

  it("TC-HANDOFF-C-02: 依頼元以外（代打先本人）が取消 → 403", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(agentAProfileId, "agent");
    const createRes = await handoffPOST(
      new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_agent_id: agentBProfileId }) }),
      { params: Promise.resolve({ eventId }) },
    );
    const { handoff_id } = await createRes.json();

    mockAs(agentBProfileId, "agent");
    const res = await handoffDELETE(
      new Request("http://localhost", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoff_id }) }),
      { params: Promise.resolve({ eventId }) },
    );
    expect(res.status).toBe(403);
  });

  it("TC-HANDOFF-C-03: 既に承諾済みの依頼を取消しようとする → 400", async () => {
    const eventId = await insertPendingHandoffEvent("published");
    mockAs(agentAProfileId, "agent");
    const createRes = await handoffPOST(
      new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_agent_id: agentBProfileId }) }),
      { params: Promise.resolve({ eventId }) },
    );
    const { handoff_id } = await createRes.json();

    mockAs(agentBProfileId, "agent");
    await handoffPATCH(
      new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoff_id, action: "accept" }) }),
      { params: Promise.resolve({ eventId }) },
    );

    mockAs(agentAProfileId, "agent");
    const res = await handoffDELETE(
      new Request("http://localhost", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoff_id }) }),
      { params: Promise.resolve({ eventId }) },
    );
    expect(res.status).toBe(400);
  });
});
