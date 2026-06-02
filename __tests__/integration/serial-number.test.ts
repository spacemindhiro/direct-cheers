/**
 * TC-SERIAL: シリアルナンバー採番テスト
 *
 * assign_serial_number RPC の3スコープが正しくカウントアップされることを検証する。
 * 「何回決済しても1になる」バグがないことを保証。
 *
 * スコープ定義:
 *   event  → scope_key = "event:{event_id}"    同イベント内で全QRが連番を共有
 *   artist → scope_key = "artist:{event_id}:{artist_id}"  アーティスト別に独立した連番
 *   qr     → scope_key = "qr:{qr_config_id}"   QR設定ごとに独立した連番
 *
 * 各スコープで3回採番し、1→2→3 とカウントアップされることを確認する。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertQrConfig,
  insertTransaction,
} from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

let organizerProfileId: string;
let artistAProfileId: string;
let artistBProfileId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  scopeKeys: [] as string[], // serial_sequences のクリーンアップ用
};

/** RPC を直接呼んでシリアルナンバーを取得 */
async function assignSerial(params: {
  transactionId: string;
  eventId: string;
  artistId?: string | null;
  qrConfigId?: string | null;
}): Promise<number> {
  const { data, error } = await testAdmin.rpc("assign_serial_number", {
    p_transaction_id: params.transactionId,
    p_event_id: params.eventId,
    p_artist_id: params.artistId ?? null,
    p_qr_config_id: params.qrConfigId ?? null,
  });
  if (error) throw new Error(`assign_serial_number 失敗: ${error.message}`);
  return data as number;
}

/** event に serial_scope をセットするヘルパー */
async function setEventScope(eventId: string, scope: "event" | "artist" | "qr") {
  await testAdmin.from("events").update({ serial_scope: scope }).eq("event_id", eventId);
}

/** qr_config に serial_scope をセットするヘルパー */
async function setQrScope(qrConfigId: string, scope: "event" | "artist" | "qr") {
  await testAdmin.from("qr_configs").update({ serial_scope: scope }).eq("qr_config_id", qrConfigId);
}

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer", displayName: "org-serial", email: `org-serial-${ts}@test.local`,
  });
  artistAProfileId = await insertProfile({
    role: "artist", displayName: "artistA-serial", email: `artist-a-serial-${ts}@test.local`,
  });
  artistBProfileId = await insertProfile({
    role: "artist", displayName: "artistB-serial", email: `artist-b-serial-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId, artistAProfileId, artistBProfileId);
}, 30_000);

afterAll(async () => {
  if (cleanup.transactionIds.length)
    await testAdmin.from("transactions").delete().in("transaction_id", cleanup.transactionIds);
  if (cleanup.qrConfigIds.length) {
    await testAdmin.from("qr_config_targets").delete().in("qr_config_id", cleanup.qrConfigIds);
    await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  }
  if (cleanup.eventIds.length)
    await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  if (cleanup.scopeKeys.length)
    await testAdmin.from("serial_sequences").delete().in("scope_key", cleanup.scopeKeys);
  await deleteAuthUsers(cleanup.profileIds);
});

// ─────────────────────────────────────────────────────────────────────────
// パターン1: event スコープ（同イベント全体で連番）
// ─────────────────────────────────────────────────────────────────────────
describe("TC-SERIAL-1: event スコープ — 同イベント内で連番", () => {
  let eventId: string;
  let qrConfigId: string;

  beforeAll(async () => {
    eventId = await insertEvent({ organizerProfileId, title: "TC-SERIAL-1 event" });
    await setEventScope(eventId, "event");
    cleanup.eventIds.push(eventId);
    cleanup.scopeKeys.push(`event:${eventId}`);

    qrConfigId = await insertQrConfig({
      eventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    cleanup.qrConfigIds.push(qrConfigId);
  });

  it("1回目 → 1、2回目 → 2、3回目 → 3（連番になる）", async () => {
    const tx1 = await insertTransaction({
      qrConfigId, grossAmount: 1000, netAmount: 860, stripeFee: 40, platformFee: 100,
      stripePaymentIntentId: `pi_serial1_a_${Date.now()}`,
    });
    const tx2 = await insertTransaction({
      qrConfigId, grossAmount: 1000, netAmount: 860, stripeFee: 40, platformFee: 100,
      stripePaymentIntentId: `pi_serial1_b_${Date.now()}`,
    });
    const tx3 = await insertTransaction({
      qrConfigId, grossAmount: 1000, netAmount: 860, stripeFee: 40, platformFee: 100,
      stripePaymentIntentId: `pi_serial1_c_${Date.now()}`,
    });
    cleanup.transactionIds.push(tx1, tx2, tx3);

    const s1 = await assignSerial({ transactionId: tx1, eventId, qrConfigId });
    const s2 = await assignSerial({ transactionId: tx2, eventId, qrConfigId });
    const s3 = await assignSerial({ transactionId: tx3, eventId, qrConfigId });

    expect(s1).toBe(1);
    expect(s2).toBe(2);
    expect(s3).toBe(3);
  });

  it("同一トランザクションへの二重呼び出し → 冪等（同じ番号を返す）", async () => {
    // 上のテストで tx1 は 1 が採番済み
    const { data: rows } = await testAdmin
      .from("transactions")
      .select("transaction_id, sequence_number_in_event")
      .like("stripe_payment_intent_id", "pi_serial1_a_%")
      .limit(1);
    const txId = rows?.[0]?.transaction_id;
    if (!txId) return; // 上のテストがスキップされた場合

    const again = await assignSerial({ transactionId: txId, eventId, qrConfigId });
    // 既に採番済みなので同じ番号が返る（4 にならない）
    expect(again).toBe(rows![0].sequence_number_in_event);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// パターン2: artist スコープ（アーティスト別に独立した連番）
// ─────────────────────────────────────────────────────────────────────────
describe("TC-SERIAL-2: artist スコープ — アーティスト別に独立した連番", () => {
  let eventId: string;
  let qrA: string; // artist A 向け QR
  let qrB: string; // artist B 向け QR

  beforeAll(async () => {
    eventId = await insertEvent({ organizerProfileId, title: "TC-SERIAL-2 artist" });
    await setEventScope(eventId, "artist");
    cleanup.eventIds.push(eventId);
    cleanup.scopeKeys.push(
      `artist:${eventId}:${artistAProfileId}`,
      `artist:${eventId}:${artistBProfileId}`,
    );

    qrA = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistAProfileId });
    qrB = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: artistBProfileId });
    cleanup.qrConfigIds.push(qrA, qrB);
  });

  it("artist A に3回 → 1, 2, 3（独自カウンター）", async () => {
    const txs = await Promise.all([1, 2, 3].map((i) =>
      insertTransaction({
        qrConfigId: qrA, grossAmount: 1000, netAmount: 860, stripeFee: 40, platformFee: 100,
        stripePaymentIntentId: `pi_serial2_a${i}_${Date.now()}_${i}`,
      })
    ));
    cleanup.transactionIds.push(...txs);

    const serials = [];
    for (const txId of txs) {
      serials.push(await assignSerial({ transactionId: txId, eventId, artistId: artistAProfileId, qrConfigId: qrA }));
    }

    expect(serials).toEqual([1, 2, 3]);
  });

  it("artist B に3回 → 1, 2, 3（A と独立したカウンター）", async () => {
    const txs = await Promise.all([1, 2, 3].map((i) =>
      insertTransaction({
        qrConfigId: qrB, grossAmount: 1000, netAmount: 860, stripeFee: 40, platformFee: 100,
        stripePaymentIntentId: `pi_serial2_b${i}_${Date.now()}_${i}`,
      })
    ));
    cleanup.transactionIds.push(...txs);

    const serials = [];
    for (const txId of txs) {
      serials.push(await assignSerial({ transactionId: txId, eventId, artistId: artistBProfileId, qrConfigId: qrB }));
    }

    // artist A が 3 まで進んでいても artist B は 1 から始まる
    expect(serials).toEqual([1, 2, 3]);
  });

  it("artist A の最終値が artist B の影響を受けていない", async () => {
    const { data: rows } = await testAdmin
      .from("serial_sequences")
      .select("scope_key, last_seq")
      .in("scope_key", [
        `artist:${eventId}:${artistAProfileId}`,
        `artist:${eventId}:${artistBProfileId}`,
      ]);

    const aRow = rows?.find((r) => r.scope_key.includes(artistAProfileId));
    const bRow = rows?.find((r) => r.scope_key.includes(artistBProfileId));

    expect(aRow?.last_seq).toBe(3); // A は 3 まで進んでいる
    expect(bRow?.last_seq).toBe(3); // B も独立して 3 まで進んでいる
  });
});

// ─────────────────────────────────────────────────────────────────────────
// パターン3: qr スコープ（QR設定ごとに独立した連番）
// ─────────────────────────────────────────────────────────────────────────
describe("TC-SERIAL-3: qr スコープ — QR設定ごとに独立した連番", () => {
  let eventId: string;
  let qr1: string;
  let qr2: string;

  beforeAll(async () => {
    eventId = await insertEvent({ organizerProfileId, title: "TC-SERIAL-3 qr" });
    cleanup.eventIds.push(eventId);

    qr1 = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    qr2 = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    cleanup.qrConfigIds.push(qr1, qr2);

    // qr_config レベルでスコープを設定
    await setQrScope(qr1, "qr");
    await setQrScope(qr2, "qr");
    cleanup.scopeKeys.push(`qr:${qr1}`, `qr:${qr2}`);
  });

  it("QR-1 に3回 → 1, 2, 3（独自カウンター）", async () => {
    const txs = await Promise.all([1, 2, 3].map((i) =>
      insertTransaction({
        qrConfigId: qr1, grossAmount: 1000, netAmount: 860, stripeFee: 40, platformFee: 100,
        stripePaymentIntentId: `pi_serial3_q1_${Date.now()}_${i}`,
      })
    ));
    cleanup.transactionIds.push(...txs);

    const serials = [];
    for (const txId of txs) {
      serials.push(await assignSerial({ transactionId: txId, eventId, qrConfigId: qr1 }));
    }

    expect(serials).toEqual([1, 2, 3]);
  });

  it("QR-2 に3回 → 1, 2, 3（QR-1 と独立したカウンター）", async () => {
    const txs = await Promise.all([1, 2, 3].map((i) =>
      insertTransaction({
        qrConfigId: qr2, grossAmount: 1000, netAmount: 860, stripeFee: 40, platformFee: 100,
        stripePaymentIntentId: `pi_serial3_q2_${Date.now()}_${i}`,
      })
    ));
    cleanup.transactionIds.push(...txs);

    const serials = [];
    for (const txId of txs) {
      serials.push(await assignSerial({ transactionId: txId, eventId, qrConfigId: qr2 }));
    }

    // QR-1 が 3 まで進んでいても QR-2 は 1 から始まる
    expect(serials).toEqual([1, 2, 3]);
  });

  it("QR-1 と QR-2 の scope_key が別々に管理されている", async () => {
    const { data: rows } = await testAdmin
      .from("serial_sequences")
      .select("scope_key, last_seq")
      .in("scope_key", [`qr:${qr1}`, `qr:${qr2}`]);

    expect(rows).toHaveLength(2);
    expect(rows?.find((r) => r.scope_key === `qr:${qr1}`)?.last_seq).toBe(3);
    expect(rows?.find((r) => r.scope_key === `qr:${qr2}`)?.last_seq).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 採番の連続性（バグ再現テスト）
// ─────────────────────────────────────────────────────────────────────────
describe("TC-SERIAL-BUG: 「何回決済しても1になる」バグ再現テスト", () => {
  it("同一イベントへの5連続決済 → 1,2,3,4,5 になる（全て1にならない）", async () => {
    const eventId = await insertEvent({ organizerProfileId, title: "TC-SERIAL-BUG event" });
    cleanup.eventIds.push(eventId);
    cleanup.scopeKeys.push(`event:${eventId}`);

    const qrConfigId = await insertQrConfig({
      eventId,
      creatorProfileId: organizerProfileId,
      recipientProfileId: organizerProfileId,
    });
    cleanup.qrConfigIds.push(qrConfigId);

    const txIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const txId = await insertTransaction({
        qrConfigId, grossAmount: 1000, netAmount: 860, stripeFee: 40, platformFee: 100,
        stripePaymentIntentId: `pi_serial_bug_${Date.now()}_${i}`,
      });
      txIds.push(txId);
    }
    cleanup.transactionIds.push(...txIds);

    const serials: number[] = [];
    for (const txId of txIds) {
      serials.push(await assignSerial({ transactionId: txId, eventId, qrConfigId }));
    }

    // バグがあれば全て 1 になる。正常なら 1,2,3,4,5
    expect(serials).toEqual([1, 2, 3, 4, 5]);

    // 全て異なる値（重複なし）
    const unique = new Set(serials);
    expect(unique.size).toBe(5);
  });
});
