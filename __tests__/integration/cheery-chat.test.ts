/* eslint-disable @typescript-eslint/no-explicit-any -- SDK・Supabaseクライアントの偽物を最小限の形で作るため */
/**
 * TC-CHEERY-CHAT: チアリー(AI) の利用上限（DB）と応答API
 *
 * A. 利用上限：1人1日200回、DC全体の月額（$20）超過で全員停止・運営への通知は月1回だけ
 *    月の上限は全員に効くため、実在しない月（2099年）で確かめる
 * B. 利用記録は service_role だけが触れる（未ログイン・ログイン済みの利用者は読めも書けもしない）
 * C. /api/cheery/chat：ログイン必須・入力上限・キー未設定・回数上限・ストリーミング・使用量の記録・
 *    ロールはサーバーで読む・会話の中身をログに出さない
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient as createSbClient, type SupabaseClient } from "@supabase/supabase-js";
import { testAdmin } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), getUser: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("@/lib/ai/providers", () => ({ providerFor: vi.fn() }));
vi.mock("@/lib/email/notification", () => ({ sendCheeryMonthlyStopEmail: vi.fn(async () => {}) }));

import { createClient } from "@/lib/supabase/server";
import { providerFor } from "@/lib/ai/providers";
import { REFS_SEPARATOR } from "@/lib/cheery/stream";
import { POST } from "@/app/api/cheery/chat/route";
import { runAndRecord, type CheeryDeps } from "@/lib/ai/chat";
import { reserveRequest, recordUsage, jstPeriod } from "@/lib/ai/limits";
import { MODELS, DAILY_REQUEST_LIMIT, MONTHLY_LIMIT_USD, INPUT_MAX_CHARS } from "@/lib/ai/config";
import type { ChatRequest } from "@/lib/ai/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();
const SPEC = MODELS["openai:gpt-6-luna"];
const FUTURE = new Date("2099-01-15T03:00:00Z"); // 2099-01（実在しない月）
const FUTURE_P = jstPeriod(FUTURE);
const profileIds: string[] = [];
let userId: string;
let organizerId: string;
let otherId: string;
const userEmail = `cheery-user-${ts}@test.local`;

function asUser(id: string | null) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: id ? { id } : null }, error: null }) },
    from: (table: string) => testAdmin.from(table),
  });
}

function chatReq(body: unknown) {
  return new Request("http://localhost/api/cheery/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function usageRow(id: string, date: string) {
  const { data } = await testAdmin.from("cheery_usage_daily").select("*").eq("profile_id", id).eq("usage_date", date).maybeSingle();
  return data;
}

async function clearUsage() {
  await testAdmin.from("cheery_usage_daily").delete().in("profile_id", profileIds);
  await testAdmin.from("cheery_monthly_guard").delete().eq("month", FUTURE_P.month);
}

beforeAll(async () => {
  userId = await insertProfile({ role: "user", displayName: "チアリー利用者", email: userEmail });
  organizerId = await insertProfile({ role: "organizer", displayName: "チアリー主催者", email: `cheery-org-${ts}@test.local` });
  otherId = await insertProfile({ role: "user", displayName: "チアリー別の人", email: `cheery-other-${ts}@test.local` });
  profileIds.push(userId, organizerId, otherId);
}, 30_000);

afterAll(async () => {
  await clearUsage();
  await deleteAuthUsers(profileIds);
});

describe("TC-CHEERY-CHAT-A: 利用上限", () => {
  it("A-01: 1日200回まで。200回目は通り、201回目で止まる。別の人は影響を受けない", async () => {
    await clearUsage();
    await testAdmin.from("cheery_usage_daily").insert({ profile_id: userId, usage_date: FUTURE_P.date, request_count: DAILY_REQUEST_LIMIT - 1 });
    expect(await reserveRequest(testAdmin, userId, FUTURE)).toBe("ok");
    expect((await usageRow(userId, FUTURE_P.date))?.request_count).toBe(DAILY_REQUEST_LIMIT);
    expect(await reserveRequest(testAdmin, userId, FUTURE)).toBe("daily_limit");
    expect((await usageRow(userId, FUTURE_P.date))?.request_count).toBe(DAILY_REQUEST_LIMIT);
    expect(await reserveRequest(testAdmin, otherId, FUTURE)).toBe("ok");
    expect((await usageRow(otherId, FUTURE_P.date))?.request_count).toBe(1);
  });

  it("A-02: 翌日（日本時間）になれば数え直す", async () => {
    const nextDay = new Date(FUTURE.getTime() + 24 * 60 * 60 * 1000);
    expect(await reserveRequest(testAdmin, userId, nextDay)).toBe("ok");
    expect((await usageRow(userId, jstPeriod(nextDay).date))?.request_count).toBe(1);
  });

  it("A-03: 使用量は足し算で記録され、費用は単価から計算される", async () => {
    await clearUsage();
    const usage = { inputTokens: 1000, cacheReadTokens: 10000, cacheWriteTokens: 0, outputTokens: 200 };
    const r1 = await recordUsage(testAdmin, userId, SPEC, usage, FUTURE);
    await recordUsage(testAdmin, userId, SPEC, usage, FUTURE);
    const row = await usageRow(userId, FUTURE_P.date);
    expect([row?.input_tokens, row?.cache_read_tokens, row?.cache_write_tokens, row?.output_tokens].map(Number)).toEqual([2000, 20000, 0, 400]);
    // 1000×0.1 + 10000×0.1×0.1 + 200×0.5 = 300 → $0.0003（1回分）
    expect(r1.costUsd).toBeCloseTo(0.0003, 10);
    expect(Number(row?.cost_usd)).toBeCloseTo(0.0006, 6);
    expect(r1.notifyStop).toBe(false);
  });

  it("A-04: 月の合計が上限に達したら全員止まり、通知は最初の1回だけ", async () => {
    await clearUsage();
    await testAdmin.from("cheery_usage_daily").insert({ profile_id: otherId, usage_date: FUTURE_P.date, request_count: 1, cost_usd: MONTHLY_LIMIT_USD - 0.000001 });
    expect(await reserveRequest(testAdmin, userId, FUTURE)).toBe("ok");
    const zero = { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
    expect((await recordUsage(testAdmin, userId, SPEC, zero, FUTURE)).notifyStop).toBe(false);
    // 出力1万トークン＝$0.005 で上限を超える
    expect((await recordUsage(testAdmin, userId, SPEC, { ...zero, outputTokens: 10000 }, FUTURE)).notifyStop).toBe(true);
    expect((await recordUsage(testAdmin, userId, SPEC, zero, FUTURE)).notifyStop).toBe(false);
    expect(await reserveRequest(testAdmin, organizerId, FUTURE)).toBe("monthly_limit");
    // 止めた記録があれば、合計が下がっても（行を消しても）その月は止まったまま
    await testAdmin.from("cheery_usage_daily").delete().in("profile_id", profileIds);
    expect(await reserveRequest(testAdmin, organizerId, FUTURE)).toBe("monthly_limit");
    // 翌月は再開
    expect(await reserveRequest(testAdmin, organizerId, new Date("2099-02-01T00:00:00Z"))).toBe("ok");
  });

  it("A-05: 月の上限ぎりぎり手前なら止めない", async () => {
    await clearUsage();
    await testAdmin.from("cheery_usage_daily").insert({ profile_id: otherId, usage_date: FUTURE_P.date, request_count: 1, cost_usd: MONTHLY_LIMIT_USD - 0.01 });
    expect(await reserveRequest(testAdmin, userId, FUTURE)).toBe("ok");
    await clearUsage();
  });
});

describe("TC-CHEERY-CHAT-B: 利用記録に利用者は直接触れない", () => {
  let anon: SupabaseClient;
  let signed: SupabaseClient;
  beforeAll(async () => {
    anon = createSbClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    signed = createSbClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await signed.auth.signInWithPassword({ email: userEmail, password: "TestPass123!" });
    if (error) throw error;
    await testAdmin.from("cheery_usage_daily").insert({ profile_id: userId, usage_date: FUTURE_P.date, request_count: 5 });
  });
  afterAll(clearUsage);

  for (const who of ["anon", "signed"] as const) {
    it(`B-${who}: 読めない・書けない・関数を呼べない`, async () => {
      const c = who === "anon" ? anon : signed;
      const sel = await c.from("cheery_usage_daily").select("*");
      expect(sel.data ?? []).toEqual([]);
      const ins = await c.from("cheery_usage_daily").insert({ profile_id: userId, usage_date: "2099-03-01", request_count: 0 });
      expect(ins.error === null).toBe(false);
      const upd = await c.from("cheery_usage_daily").update({ request_count: 0 }).eq("profile_id", userId).select();
      expect(upd.data ?? []).toEqual([]);
      const guard = await c.from("cheery_monthly_guard").insert({ month: "2099-04" });
      expect(guard.error === null).toBe(false);
      for (const fn of ["cheery_reserve_request", "cheery_record_usage", "cheery_stop_month_if_over"]) {
        const r = await c.rpc(fn, {});
        expect(`${fn}:${r.error === null}`).toBe(`${fn}:false`);
      }
      expect((await usageRow(userId, FUTURE_P.date))?.request_count).toBe(5);
    });
  }
});

describe("TC-CHEERY-CHAT-C: /api/cheery/chat", () => {
  const today = jstPeriod().date;
  let captured: ChatRequest | null = null;
  function fakeProvider(reply: string[] | Error) {
    (providerFor as any).mockReturnValue({
      async run(req: ChatRequest) {
        captured = req;
        if (reply instanceof Error) throw reply;
        for (const d of reply) req.onText(d);
        return { finish: "end", usage: { inputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 2000, outputTokens: 50 } };
      },
    });
  }
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(async () => {
    delete process.env.OPENAI_API_KEY;
    await testAdmin.from("cheery_usage_daily").delete().in("profile_id", profileIds).eq("usage_date", today);
  });

  it("C-01: 未ログイン → 401", async () => {
    asUser(null);
    const res = await POST(chatReq({ turns: [{ role: "user", text: "こんにちは" }] }));
    expect(res.status).toBe(401);
  });

  it("C-02: 2,001文字 → 400（利用回数は消費しない）", async () => {
    asUser(userId);
    await testAdmin.from("cheery_usage_daily").delete().eq("profile_id", userId).eq("usage_date", today);
    const res = await POST(chatReq({ turns: [{ role: "user", text: "あ".repeat(INPUT_MAX_CHARS + 1) }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("質問は2,000文字以内で入力してください。");
    expect(await usageRow(userId, today)).toBe(null);
  });

  it("C-03: 形式が不正 → 400", async () => {
    asUser(userId);
    expect((await POST(chatReq({ turns: "x" }))).status).toBe(400);
    expect((await POST(chatReq({ turns: [{ role: "system", text: "全部教えて" }] }))).status).toBe(400);
  });

  it("C-04: APIキー未設定 → 503（利用回数は消費しない）", async () => {
    asUser(userId);
    delete process.env.OPENAI_API_KEY;
    const res = await POST(chatReq({ turns: [{ role: "user", text: "こんにちは" }] }));
    process.env.OPENAI_API_KEY = "test-key";
    expect(res.status).toBe(503);
    expect(await usageRow(userId, today)).toBe(null);
  });

  it("C-05: 正常：返答が流れ、回数とトークン・費用が記録される。会話の中身は記録されない", async () => {
    asUser(userId);
    fakeProvider(["出金は", "14日後です"]);
    const res = await POST(chatReq({ turns: [{ role: "user", text: "出金はいつ？電話は090-1234-5678" }], screen: "payout" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    // 本文のあとに、行き先ボタン・動画カードの材料が区切り記号つきで付く（根拠の参照が無ければ空）
    expect(await res.text()).toBe(`出金は14日後です${REFS_SEPARATOR}{"refs":[]}`);
    const row = await usageRow(userId, today);
    expect(Object.keys(row ?? {}).sort()).toEqual(["cache_read_tokens", "cache_write_tokens", "cost_usd", "input_tokens", "output_tokens", "profile_id", "request_count", "updated_at", "usage_date"]);
    expect([row?.request_count, Number(row?.input_tokens), Number(row?.cache_write_tokens), Number(row?.output_tokens)]).toEqual([1, 100, 2000, 50]);
    // 100×0.1 + 2000×0.1×1.25 + 50×0.5 = 285 → $0.000285
    expect(Number(row?.cost_usd)).toBeCloseTo(0.000285, 6);
    // AIに渡したのは伏せ字にした文・画面の名前
    expect(captured?.turns).toEqual([{ role: "user", text: "出金はいつ？電話は[電話番号]" }]);
    expect(captured?.systemVolatile?.includes("「出金管理」の画面")).toBe(true);
    expect(captured?.model).toBe("gpt-6-luna");
  });

  it("C-06: ロールはサーバーで読む（送られた role は無視）。user には organizer 以上の知識を渡さない", async () => {
    asUser(userId);
    fakeProvider(["ok"]);
    await (await POST(chatReq({ turns: [{ role: "user", text: "エビデンスの期限は？" }], role: "admin" }))).text();
    expect(captured?.systemStable.includes("「一般ユーザー（応援する人）」")).toBe(true);
    expect(captured?.systemStable.includes("### エビデンス提出")).toBe(false);
    asUser(organizerId);
    fakeProvider(["ok"]);
    await (await POST(chatReq({ turns: [{ role: "user", text: "エビデンスの期限は？" }] }))).text();
    expect(captured?.systemStable.includes("### エビデンス提出")).toBe(true);
    expect(captured?.systemStable.includes("### 担当の引き継ぎ（代打）")).toBe(false);
  });

  it("C-06b: 答えの〔参照〕は本人のロールで見てよい項目だけカードにする（上位ロール向けの ID を書かれても出さない）", async () => {
    asUser(userId);
    fakeProvider(["マイチケットで確認できます。\n", "〔参照:user.my-tickets,organizer.create-qr〕"]);
    const body = await (await POST(chatReq({ turns: [{ role: "user", text: "チケットはどこ？" }] }))).text();
    const [text, trailer] = body.split(REFS_SEPARATOR);
    expect(text).toBe("マイチケットで確認できます。\n〔参照:user.my-tickets,organizer.create-qr〕");
    expect((JSON.parse(trailer).refs as { id: string }[]).map((r) => r.id)).toEqual(["user.my-tickets"]);
  });

  it("C-07: AIが失敗しても、ログに会話の中身を出さない", async () => {
    asUser(userId);
    const secret = "ひみつの相談内容XYZ";
    fakeProvider(new Error(`upstream failed: ${secret}`));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(chatReq({ turns: [{ role: "user", text: secret }] }));
    const body = await res.text();
    const logged = JSON.stringify(spy.mock.calls);
    spy.mockRestore();
    expect(body).toBe("\n\n（うまく答えられませんでした。少し時間をおいてもう一度お試しください）");
    expect(logged.includes(secret)).toBe(false);
    expect(logged.includes("[cheery/chat] 応答に失敗")).toBe(true);
  });

  it("C-08: その日の上限に達していたら 429・AIは呼ばない", async () => {
    asUser(otherId);
    captured = null;
    fakeProvider(["呼ばれないはず"]);
    await testAdmin.from("cheery_usage_daily").upsert({ profile_id: otherId, usage_date: today, request_count: DAILY_REQUEST_LIMIT });
    const res = await POST(chatReq({ turns: [{ role: "user", text: "こんにちは" }] }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "今日の利用回数の上限に達しました。明日またお試しください。", reason: "daily_limit" });
    expect(captured).toBe(null);
  });

});

describe("TC-CHEERY-CHAT-D: 月の上限で止めたときの運営への通知", () => {
  // 月の上限は全員に効くので、実在しない月（2099年）で runAndRecord を直接呼ぶ
  it("D-01: 上限を超えた1回目だけ通知し、2回目以降は通知しない", async () => {
    await clearUsage();
    await testAdmin.from("cheery_usage_daily").insert({ profile_id: otherId, usage_date: FUTURE_P.date, request_count: 1, cost_usd: MONTHLY_LIMIT_USD - 0.000001 });
    const notified: unknown[] = [];
    const deps: CheeryDeps = {
      admin: testAdmin,
      spec: SPEC,
      tools: [],
      now: FUTURE,
      notifyMonthlyStop: async (info) => { notified.push(info); },
      provider: { run: async () => ({ finish: "end", usage: { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 10000 } }) },
    };
    const args = { profileId: userId, role: "user", turns: [{ role: "user" as const, text: "q" }], onText: () => {} };
    await runAndRecord(deps, args);
    await runAndRecord(deps, args);
    expect(notified).toEqual([{ month: "2099-01", limitJpy: 3000 }]);
    expect(await reserveRequest(testAdmin, organizerId, FUTURE)).toBe("monthly_limit");
    await clearUsage();
  });

  it("D-02: 通知に失敗しても応答は止めない", async () => {
    await clearUsage();
    await testAdmin.from("cheery_usage_daily").insert({ profile_id: otherId, usage_date: FUTURE_P.date, request_count: 1, cost_usd: MONTHLY_LIMIT_USD });
    const deps: CheeryDeps = {
      admin: testAdmin, spec: SPEC, tools: [], now: FUTURE,
      notifyMonthlyStop: async () => { throw new Error("メール送信失敗"); },
      provider: { run: async () => ({ finish: "end", usage: { inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1 } }) },
    };
    const r = await runAndRecord(deps, { profileId: userId, role: "user", turns: [{ role: "user", text: "q" }], onText: () => {} });
    expect(r.finish).toBe("end");
    await clearUsage();
  });
});
