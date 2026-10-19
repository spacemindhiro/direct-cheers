/**
 * TC-AGENTCONV: オーガナイザー↔担当エージェントの会話（イベント単位）
 *
 * 会話（conversations / messages）の読み取りは RLS・API とも「参加者だけ」なので、
 * 見える範囲は「誰が参加者として入るか」で決まる。ここを固定する。
 *   A. 会話の作成（POST /api/events/[eventId]/agent-conversation）：当事者以外は作れない
 *   B. 代打（handoff 承諾）後：新エージェントには旧エージェントとの会話が見えない
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
import { POST as convPOST } from "@/app/api/events/[eventId]/agent-conversation/route";
import { POST as handoffPOST, PATCH as handoffPATCH } from "@/app/api/events/[eventId]/handoff/route";
import { GET as messagesGET } from "@/app/api/messages/route";
import { GET as threadGET } from "@/app/api/messages/[conversationId]/route";

let organizerId: string;
let agentAId: string; // 現担当
let agentBId: string; // 代打先
let agentCId: string; // 無関係のエージェント
let otherOrganizerId: string; // 無関係のオーガナイザー
let artistId: string;

const cleanup = { profileIds: [] as string[], eventIds: [] as string[] };

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

const post = (eventId: string) =>
  convPOST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ eventId }) });

async function agentConversations(eventId: string) {
  const { data } = await testAdmin
    .from("conversations")
    .select("conversation_id, agent_profile_id, conversation_participants(profile_id)")
    .eq("event_id", eventId)
    .eq("type", "agent");
  return (data ?? []).map((c) => ({
    conversation_id: c.conversation_id as string,
    agent_profile_id: c.agent_profile_id as string,
    participants: ((c.conversation_participants ?? []) as { profile_id: string }[]).map((p) => p.profile_id).sort(),
  }));
}

async function newEvent(agentId: string, title: string) {
  const eventId = await insertEvent({ organizerProfileId: organizerId, agentId, title });
  cleanup.eventIds.push(eventId);
  return eventId;
}

beforeAll(async () => {
  const ts = Date.now();
  organizerId = await insertProfile({ role: "organizer", displayName: "主催者（会話）", email: `org-ac-${ts}@test.local` });
  agentAId = await insertProfile({ role: "agent", displayName: "エージェントA（会話）", email: `agent-a-ac-${ts}@test.local` });
  agentBId = await insertProfile({ role: "agent", displayName: "エージェントB（会話）", email: `agent-b-ac-${ts}@test.local` });
  agentCId = await insertProfile({ role: "agent", displayName: "エージェントC（会話）", email: `agent-c-ac-${ts}@test.local` });
  otherOrganizerId = await insertProfile({ role: "organizer", displayName: "別の主催者（会話）", email: `org2-ac-${ts}@test.local` });
  artistId = await insertProfile({ role: "artist", displayName: "アーティスト（会話）", email: `artist-ac-${ts}@test.local` });
  cleanup.profileIds.push(organizerId, agentAId, agentBId, agentCId, otherOrganizerId, artistId);
}, 30_000);

afterAll(async () => {
  if (cleanup.eventIds.length) {
    await testAdmin.from("conversations").delete().in("event_id", cleanup.eventIds);
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  }
  await deleteAuthUsers(cleanup.profileIds);
});

describe("TC-AGENTCONV-A: 会話の作成は当事者のみ", () => {
  it("A-01: 主催者が作成 → 200・参加者は主催者と担当エージェントの2人だけ", async () => {
    const eventId = await newEvent(agentAId, "TC-AGENTCONV A-01");
    mockAs(organizerId, "organizer");
    const res = await post(eventId);
    expect(res.status).toBe(200);
    const { conversation_id } = await res.json();

    const convs = await agentConversations(eventId);
    expect(convs).toEqual([{ conversation_id, agent_profile_id: agentAId, participants: [organizerId, agentAId].sort() }]);
  });

  it("A-02: 担当エージェントが2回呼んでも会話は1つ（同じIDが返る）", async () => {
    const eventId = await newEvent(agentAId, "TC-AGENTCONV A-02");
    mockAs(agentAId, "agent");
    const first = await (await post(eventId)).json();
    const second = await (await post(eventId)).json();
    expect(second.conversation_id).toBe(first.conversation_id);
    expect((await agentConversations(eventId)).length).toBe(1);
  });

  for (const [label, who, role] of [
    ["担当ではないエージェント", () => agentCId, "agent"],
    ["別の主催者", () => otherOrganizerId, "organizer"],
    ["アーティスト", () => artistId, "artist"],
  ] as const) {
    it(`A-03: ${label} → 403・会話は作られない`, async () => {
      const eventId = await newEvent(agentAId, `TC-AGENTCONV A-03 ${label}`);
      mockAs(who(), role);
      const res = await post(eventId);
      expect(res.status).toBe(403);
      expect(await agentConversations(eventId)).toEqual([]);
    });
  }

  it("A-04: 自主催（担当エージェント＝主催者本人）→ 400・会話は作られない", async () => {
    const eventId = await insertEvent({ organizerProfileId: agentAId, agentId: agentAId, title: "TC-AGENTCONV A-04" });
    cleanup.eventIds.push(eventId);
    mockAs(agentAId, "agent");
    const res = await post(eventId);
    expect(res.status).toBe(400);
    expect(await agentConversations(eventId)).toEqual([]);
  });

  it("A-05: 当事者でない人はスレッドを開けない（404）・一覧にも出ない", async () => {
    const eventId = await newEvent(agentAId, "TC-AGENTCONV A-05");
    mockAs(organizerId, "organizer");
    const { conversation_id } = await (await post(eventId)).json();

    for (const id of [agentCId, otherOrganizerId, artistId]) {
      mockAs(id, "agent");
      const thread = await threadGET(new Request("http://localhost"), { params: Promise.resolve({ conversationId: conversation_id }) });
      expect(thread.status).toBe(404);
      const list = (await (await messagesGET()).json()) as { conversation_id: string }[];
      const ids = list.map((c) => c.conversation_id);
      expect(ids).not.toContain(conversation_id);
    }
  });
});

describe("TC-AGENTCONV-B: 代打後は担当ごとに会話が分かれる", () => {
  it("B-01: 代打承諾で新エージェント用の会話が別に作られ、新エージェントは旧会話を開けない", async () => {
    const eventId = await newEvent(agentAId, "TC-AGENTCONV B-01");
    mockAs(organizerId, "organizer");
    const { conversation_id: oldConv } = await (await post(eventId)).json();
    await testAdmin.from("messages").insert({ conversation_id: oldConv, sender_profile_id: organizerId, body: "旧エージェントについての相談" });

    mockAs(agentAId, "agent");
    const created = await handoffPOST(
      new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_agent_id: agentBId }) }),
      { params: Promise.resolve({ eventId }) },
    );
    expect(created.status).toBe(200);
    const { handoff_id } = await created.json();

    mockAs(agentBId, "agent");
    const accepted = await handoffPATCH(
      new Request("http://localhost", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoff_id, action: "accept" }) }),
      { params: Promise.resolve({ eventId }) },
    );
    expect(accepted.status).toBe(200);

    const convs = await agentConversations(eventId);
    const byAgent = Object.fromEntries(convs.map((c) => [c.agent_profile_id, c]));
    expect(convs.length).toBe(2);
    expect(byAgent[agentAId].conversation_id).toBe(oldConv);
    expect(byAgent[agentAId].participants).toEqual([organizerId, agentAId].sort());
    expect(byAgent[agentBId].participants).toEqual([organizerId, agentBId].sort());

    // 新エージェントBは旧会話を開けない（中身も返らない）
    const thread = await threadGET(new Request("http://localhost"), { params: Promise.resolve({ conversationId: oldConv }) });
    expect(thread.status).toBe(404);
    expect(JSON.stringify(await thread.json())).not.toContain("旧エージェントについての相談");

    // 旧エージェントAは新会話を開けない
    mockAs(agentAId, "agent");
    const newThread = await threadGET(new Request("http://localhost"), { params: Promise.resolve({ conversationId: byAgent[agentBId].conversation_id }) });
    expect(newThread.status).toBe(404);
  });
});
