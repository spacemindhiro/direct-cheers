/**
 * TC-RECONCILE-LOCK: lib/reconcile-lock.ts の統合テスト
 * 2026-07-27、手動照合の同時実行レースでPIの兄弟行の按分に1円の不整合が
 * 発生した件の再発防止用ロック機構を検証する。
 */
import { describe, it, expect, afterEach } from "vitest";
import { acquirePiLock, releasePiLock } from "@/lib/reconcile-lock";
import { testAdmin } from "../helpers/db-reset";

const TEST_PI_ID = "pi_test_reconcile_lock_TC";

describe("TC-RECONCILE-LOCK", () => {
  afterEach(async () => {
    await testAdmin.from("reconcile_pi_locks").delete().eq("pi_id", TEST_PI_ID);
  });

  it("初回取得は成功する", async () => {
    const got = await acquirePiLock(testAdmin, TEST_PI_ID);
    expect(got).toBe(true);
  });

  it("取得済みの間は2回目の取得が失敗する（同時実行の再現）", async () => {
    const first = await acquirePiLock(testAdmin, TEST_PI_ID);
    const second = await acquirePiLock(testAdmin, TEST_PI_ID);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("解放後は再取得できる", async () => {
    await acquirePiLock(testAdmin, TEST_PI_ID);
    await releasePiLock(testAdmin, TEST_PI_ID);
    const reacquired = await acquirePiLock(testAdmin, TEST_PI_ID);
    expect(reacquired).toBe(true);
  });

  it("5分より古い古いロック（クラッシュ後の残留）は奪取できる", async () => {
    await testAdmin.from("reconcile_pi_locks").insert({
      pi_id: TEST_PI_ID,
      locked_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    });
    const gotStale = await acquirePiLock(testAdmin, TEST_PI_ID);
    expect(gotStale).toBe(true);
  });

  it("5分以内の新しいロックは奪取できない", async () => {
    await testAdmin.from("reconcile_pi_locks").insert({
      pi_id: TEST_PI_ID,
      locked_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
    });
    const gotFresh = await acquirePiLock(testAdmin, TEST_PI_ID);
    expect(gotFresh).toBe(false);
  });
});
