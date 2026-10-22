/**
 * TC-EVENT-ACTIONS-CLOSE: イベント詳細の「今できる操作」（lib/event-actions.ts）の締め時刻まわり
 *
 * 画面とチアリー(AI) の event_detail で共用する判定。証跡の提出は締め時刻（終了3時間後）を過ぎた
 * 公開後〜精算前のイベントだけ。終了ボタンは2026-10-22に廃止したので、終了の操作は誰にも出さない。
 */
import { describe, it, expect } from "vitest";
import { eventActions } from "@/lib/event-actions";

const ORG = "org-1";
const AGENT = "agent-1";
const OTHER = "other-1";
const END = new Date("2026-10-18T13:00:00Z");
const HOUR = 60 * 60 * 1000;

function run(opts: { userId: string; role: string; status: string; nowOffsetMs: number }) {
  return eventActions({
    userId: opts.userId,
    role: opts.role,
    event: { organizer_profile_id: ORG, agent_id: AGENT, lifecycle_status: opts.status, end_at: END.toISOString() },
    isLineupArtist: false,
    pendingHandoff: null,
    now: new Date(END.getTime() + opts.nowOffsetMs),
  });
}

describe("TC-EVENT-ACTIONS-CLOSE: 証跡の提出は締め時刻から", () => {
  it("終了時刻を過ぎても締め時刻（3時間後）ちょうどまでは提出できない", () => {
    for (const offset of [1, 3 * HOUR]) {
      const a = run({ userId: ORG, role: "organizer", status: "published", nowOffsetMs: offset });
      expect(a.hasEnded).toBe(false);
      expect(a.canSubmitEvidence).toBe(false);
    }
  });

  it("締め時刻を過ぎると主催者・担当エージェントは提出できる", () => {
    const org = run({ userId: ORG, role: "organizer", status: "published", nowOffsetMs: 3 * HOUR + 1 });
    const agent = run({ userId: AGENT, role: "agent", status: "ongoing", nowOffsetMs: 3 * HOUR + 1 });
    expect([org.hasEnded, org.canSubmitEvidence]).toEqual([true, true]);
    expect([agent.hasEnded, agent.canSubmitEvidence]).toEqual([true, true]);
  });

  it("締め時刻後でも、無関係の主催者は提出できない", () => {
    const a = run({ userId: OTHER, role: "organizer", status: "published", nowOffsetMs: 10 * HOUR });
    expect(a.canSubmitEvidence).toBe(false);
  });

  it("下書き・承認待ち・中止・精算済みは締め時刻後でも提出できない", () => {
    for (const status of ["draft", "review_requested", "cancelled", "cancellation_requested", "settled"]) {
      const a = run({ userId: ORG, role: "organizer", status, nowOffsetMs: 10 * HOUR });
      expect({ status, hasEnded: a.hasEnded, canSubmitEvidence: a.canSubmitEvidence }).toEqual({ status, hasEnded: false, canSubmitEvidence: false });
    }
  });

  it("過去に終了ボタンで ended になったイベントも、締め時刻後なら提出できる", () => {
    const a = run({ userId: ORG, role: "organizer", status: "ended", nowOffsetMs: 3 * HOUR + 1 });
    expect(a.canSubmitEvidence).toBe(true);
  });

  it("終了の操作は返さない（終了ボタンは廃止）", () => {
    const a = run({ userId: ORG, role: "organizer", status: "published", nowOffsetMs: -HOUR });
    expect(Object.keys(a).includes("canEndEvent")).toBe(false);
  });
});
