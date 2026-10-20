/**
 * TC-BANK-STATUS: 売上受取口座の状態（lib/bank-status.ts）がプロフィール画面の表示条件と一致すること。
 * 画面の条件（app/[locale]/dashboard/profile/page.tsx）をそのまま書き写した関数と、全8通りで突き合わせる。
 */
import { describe, it, expect } from "vitest";
import { bankState } from "@/lib/bank-status";

// プロフィール画面の「売上受取口座」の条件の写し
function pageShows(stripeConnected: boolean, vs: string) {
  return {
    verified: stripeConnected && vs === "verified",
    pending: stripeConnected && vs === "pending",
    rejected: vs === "rejected",
    startButton: !stripeConnected || vs === "unverified" || vs === "rejected",
  };
}

describe("TC-BANK-STATUS", () => {
  for (const connected of [true, false]) {
    for (const vs of ["unverified", "pending", "verified", "rejected"]) {
      it(`口座連携${connected ? "あり" : "なし"}・${vs}`, () => {
        const s = bankState(connected ? "acct_x" : null, vs);
        const p = pageShows(connected, vs);
        expect(`${s === "verified"}/${s === "pending"}/${s === "rejected"}/${s === "not_started" || s === "rejected"}`)
          .toBe(`${p.verified}/${p.pending}/${p.rejected}/${p.startButton}`);
      });
    }
  }
});
