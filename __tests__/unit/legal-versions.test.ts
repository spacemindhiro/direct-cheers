/**
 * 公開利用規約・プライバシーポリシーの版と有効期間（lib/legal-versions.ts）
 *
 * 背景（2026-10-08）: ファンは決済・会員登録のたびに表示中の規約へみなし同意するが、
 * どの版に同意したかの記録が無かった。決済ごとに版を持たず、版の有効期間から
 * 「その日時に有効だった版」を引く方式にした。境界（施行時刻ちょうど・1ms前）と
 * 未施行版の扱い、版と本文ファイルの対応を固定する。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SERVICE_TERMS_VERSIONS,
  PRIVACY_POLICY_VERSIONS,
  versionAt,
  versionPeriods,
  latestVersion,
  type LegalVersion,
} from "@/lib/legal-versions";

const FIXTURE: LegalVersion[] = [
  { version: "v1", effectiveFrom: "2026-06-27T07:13:17Z", summary: "" },
  { version: "v2", effectiveFrom: "2026-10-08T03:00:13Z", summary: "" },
  { version: "v3", effectiveFrom: "2026-10-08T03:58:58Z", summary: "" },
  { version: "v4", effectiveFrom: null, summary: "" },
];

describe("TC-LEGALVER-01: versionAt — 指定日時に有効だった版", () => {
  it("施行時刻ちょうどはその版、1ms前は前の版", () => {
    expect(versionAt(FIXTURE, "2026-10-08T03:00:13.000Z")?.version).toBe("v2");
    expect(versionAt(FIXTURE, "2026-10-08T03:00:12.999Z")?.version).toBe("v1");
    expect(versionAt(FIXTURE, "2026-10-08T03:58:58.000Z")?.version).toBe("v3");
  });

  it("同じ日の2回の改定（v2→v3）の間は v2", () => {
    expect(versionAt(FIXTURE, "2026-10-08T03:30:00Z")?.version).toBe("v2");
  });

  it("最初の版より前は null（本番リリース前）", () => {
    expect(versionAt(FIXTURE, "2026-06-27T07:13:16.999Z")).toBe(null);
  });

  it("未施行（effectiveFrom: null）の版は、遠い未来の日時でも返さない", () => {
    expect(versionAt(FIXTURE, "2099-01-01T00:00:00Z")?.version).toBe("v3");
  });

  it("Date オブジェクトでも文字列と同じ結果", () => {
    expect(versionAt(FIXTURE, new Date("2026-10-08T03:30:00Z"))?.version).toBe("v2");
  });
});

describe("TC-LEGALVER-02: versionPeriods — 各版の有効期間", () => {
  it("effectiveTo は次の版の effectiveFrom、現行版は null、未施行版は null", () => {
    expect(versionPeriods(FIXTURE).map((p) => [p.version, p.effectiveFrom, p.effectiveTo])).toEqual([
      ["v1", "2026-06-27T07:13:17Z", "2026-10-08T03:00:13Z"],
      ["v2", "2026-10-08T03:00:13Z", "2026-10-08T03:58:58Z"],
      ["v3", "2026-10-08T03:58:58Z", null],
      ["v4", null, null],
    ]);
  });

  it("表示用の現行版は末尾（未施行版があればそれ）", () => {
    expect(latestVersion(FIXTURE).version).toBe("v4");
  });
});

describe("TC-LEGALVER-03: 実データの整合", () => {
  for (const [name, versions] of [["利用規約", SERVICE_TERMS_VERSIONS], ["プライバシーポリシー", PRIVACY_POLICY_VERSIONS]] as const) {
    it(`${name}: 版名が重複せず、施行済みの版は時刻順に並び、未施行の版は末尾にしか無い`, () => {
      const names = versions.map((v) => v.version);
      expect(new Set(names).size).toBe(names.length);
      const effective = versions.filter((v) => v.effectiveFrom !== null).map((v) => new Date(v.effectiveFrom!).getTime());
      expect(effective).toEqual([...effective].sort((a, b) => a - b));
      const firstPending = versions.findIndex((v) => v.effectiveFrom === null);
      if (firstPending >= 0) expect(versions.slice(firstPending).every((v) => v.effectiveFrom === null)).toBe(true);
    });
  }

  it("利用規約: 版の一覧と本文ファイル（components/legal/terms）が1対1", () => {
    const dir = path.join(process.cwd(), "components/legal/terms");
    const files = fs.readdirSync(dir).filter((f) => /^v.+\.tsx$/.test(f)).map((f) => f.replace(/^v|\.tsx$/g, "")).sort();
    expect(files).toEqual(SERVICE_TERMS_VERSIONS.map((v) => v.version).sort());
    const index = fs.readFileSync(path.join(dir, "index.tsx"), "utf8");
    const keys = [...index.matchAll(/^\s+'([^']+)':/gm)].map((m) => m[1]).sort();
    expect(keys).toEqual(SERVICE_TERMS_VERSIONS.map((v) => v.version).sort());
  });

  it("本番リリース前の実績：PR #138 と #139 の間（2026-10-08 12:30 JST）の決済は 2026-10-08a", () => {
    expect(versionAt(SERVICE_TERMS_VERSIONS, "2026-10-08T03:30:00Z")?.version).toBe("2026-10-08a");
    expect(versionAt(SERVICE_TERMS_VERSIONS, "2026-09-01T00:00:00Z")?.version).toBe("2026-06-27");
  });
});

// main へ出すPR（develop→main のリリース、hotfix）で未施行の版が残っていたら落とす。
// 未施行のまま本番に出ると「その版がいつから有効か」が記録されないため。
// GITHUB_BASE_REF は GitHub Actions の pull_request イベントでのみ設定される。
describe.runIf(process.env.GITHUB_BASE_REF === "main")("TC-LEGALVER-04: main 向けPRでは未施行の版が無いこと", () => {
  it("利用規約・プライバシーポリシーとも effectiveFrom がすべて記入済み", () => {
    const pending = [...SERVICE_TERMS_VERSIONS, ...PRIVACY_POLICY_VERSIONS].filter((v) => v.effectiveFrom === null).map((v) => v.version);
    expect(pending).toEqual([]);
  });
});
