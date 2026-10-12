/**
 * TC-PROFILE-WL: PATCH /api/profile の更新可能項目の制限 — 2026-10-13
 *
 * 以前は受け取ったJSONをそのまま admin クライアントで profiles に update しており、
 * ログイン済みなら誰でも自分の role を admin にする・手数料率（base_fee_rate）や
 * 残高凍結（balance_frozen）を書き換える等ができた。
 *   A. プロフィール画面が送らない項目を含むリクエストは 400・DBは一切変わらない
 *   B. 値の型が違うリクエストは 400・DBは一切変わらない
 *   C. プロフィール画面と同じ形のリクエストは今までどおり全項目保存される
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("@/lib/apple-wallet-push", () => ({
  pushWalletUpdateBySerial: vi.fn().mockResolvedValue(undefined),
}));

import { createClient } from "@/lib/supabase/server";
import { PATCH as profilePatch } from "@/app/api/profile/route";

const ts = Date.now();
const profileIds: string[] = [];
let userId: string;

const SNAPSHOT_COLUMNS =
  "profile_id, role, status, display_name, avatar_url, social_links, stripe_connect_id, verification_status, " +
  "responsible_agent_id, base_fee_rate, balance_frozen, chargeback_count, stripe_restricted, deleted_at, bio, artist_name";

function mockAuth(id: string) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id } }, error: null }) },
  });
}

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function snapshot(id: string) {
  const { data, error } = await testAdmin.from("profiles").select(SNAPSHOT_COLUMNS).eq("profile_id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

beforeAll(async () => {
  userId = await insertProfile({ role: "user", displayName: `WL User ${ts}`, email: `profile-wl-${ts}@test.local` });
  profileIds.push(userId);
  mockAuth(userId);
});

afterAll(async () => {
  await deleteAuthUsers(profileIds);
});

// ── A ──────────────────────────────────────────────────────────────────
describe("TC-PROFILE-WL-A: 画面が送らない項目は拒否・DBは変わらない", () => {
  it.each([
    ["role（自分を admin に昇格）", { role: "admin" }],
    ["status", { status: "suspended" }],
    ["verification_status", { verification_status: "verified" }],
    ["base_fee_rate（手数料率）", { base_fee_rate: 0 }],
    ["balance_frozen（残高凍結）", { balance_frozen: false }],
    ["chargeback_count", { chargeback_count: 0 }],
    ["stripe_connect_id", { stripe_connect_id: "acct_attack" }],
    ["stripe_restricted", { stripe_restricted: false }],
    ["responsible_agent_id", { responsible_agent_id: "00000000-0000-0000-0000-000000000000" }],
    ["deleted_at", { deleted_at: new Date().toISOString() }],
    ["profile_id（主キー）", { profile_id: "00000000-0000-0000-0000-000000000000" }],
  ])("A: %s → 400・DB不変", async (_label, body) => {
    const before = await snapshot(userId);
    const res = await profilePatch(makeReq(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(`更新できない項目が含まれています: ${Object.keys(body).join(", ")}`);
    expect(await snapshot(userId)).toEqual(before);
  });

  it("A-mix: 正規の項目と混ぜて送っても全体を拒否（display_name も変わらない）", async () => {
    const before = await snapshot(userId);
    const res = await profilePatch(makeReq({ display_name: `HACKED ${ts}`, role: "admin" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("更新できない項目が含まれています: role");
    const after = await snapshot(userId);
    expect(after).toEqual(before);
    expect(after.display_name).toBe(`WL User ${ts}`);
    expect(after.role).toBe("user");
  });
});

// ── B ──────────────────────────────────────────────────────────────────
describe("TC-PROFILE-WL-B: 型が違う・形が違うリクエストは拒否", () => {
  it.each([
    ["display_name が数値", { display_name: 123 }],
    ["avatar_url がオブジェクト", { avatar_url: { url: "x" } }],
    ["social_links が文字列", { social_links: "https://example.com" }],
    ["social_links が配列", { social_links: ["https://example.com"] }],
    ["social_links の値が数値", { social_links: { instagram: 1 } }],
    ["空のオブジェクト", {}],
    ["配列", [{ display_name: "x" }]],
    ["null", null],
  ])("B: %s → 400・DB不変", async (_label, body) => {
    const before = await snapshot(userId);
    const res = await profilePatch(makeReq(body));
    expect(res.status).toBe(400);
    expect(await snapshot(userId)).toEqual(before);
  });
});

// ── C ──────────────────────────────────────────────────────────────────
describe("TC-PROFILE-WL-C: プロフィール画面と同じ形のリクエストは保存される", () => {
  it("C-01: 画面が送る全14項目 → 200・全項目がそのまま保存される", async () => {
    const body = {
      display_name: `WL Saved ${ts}`,
      avatar_url: `https://example.com/a-${ts}.webp`,
      social_links: { instagram: "@wl", soundcloud: "https://soundcloud.com/wl", website: "https://wl.example.com" },
      bio: `bio ${ts}`,
      affiliation: "所属",
      credit_name: "クレジット",
      genre: "Techno",
      organization_name: "WL団体",
      organizer_name: "WL主催",
      organizer_name_ascii: "WL ORG",
      organizer_avatar_url: `https://example.com/o-${ts}.webp`,
      artist_name: "WL演者",
      artist_name_ascii: "WL ARTIST",
      artist_avatar_url: `https://example.com/r-${ts}.webp`,
    };
    const res = await profilePatch(makeReq(body));
    expect(res.status).toBe(200);
    const { data } = await testAdmin.from("profiles").select(Object.keys(body).join(", ")).eq("profile_id", userId).single();
    expect(data).toEqual(body);
  });

  it("C-02: null で消す（avatar_url / bio）→ 200・null になる", async () => {
    const res = await profilePatch(makeReq({ display_name: `WL Saved ${ts}`, avatar_url: null, bio: null, social_links: {} }));
    expect(res.status).toBe(200);
    const after = await snapshot(userId);
    expect(after.avatar_url).toBe(null);
    expect(after.bio).toBe(null);
    expect(after.social_links).toEqual({});
  });

  it("C-03: 正規の更新をしても role・手数料率などは元のまま", async () => {
    const before = await snapshot(userId);
    const res = await profilePatch(makeReq({ display_name: `WL Saved2 ${ts}` }));
    expect(res.status).toBe(200);
    const after = await snapshot(userId);
    expect(after.display_name).toBe(`WL Saved2 ${ts}`);
    expect({ ...after, display_name: before.display_name }).toEqual(before);
  });
});
