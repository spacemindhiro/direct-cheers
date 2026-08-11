/**
 * TC-INCOME: get_role_income_summary RPC の統合テスト
 *
 * 会計方針の検証:
 *   TC-INCOME-01: platform層は決済確定日(transactions.created_at)で月判定される
 *   TC-INCOME-02: agent/organizer/artist層はsettle_transfers.created_at（実着金日）で月判定される
 *     （transaction_distributions作成日=決済日ではなく、Transfer実行日を見る）
 *   TC-INCOME-03: reversedはtransaction_distributions.updated_atの月にマイナス計上される
 *   TC-INCOME-04: voidedは集計対象外
 *   TC-INCOME-05: outstanding_balanceはロールごとに分離される（agentとorganizerが混在するprofile群でも取り違えない）
 *   TC-INCOME-06: 同一profileが異なるイベントで異なるroleの分配を受けている場合、
 *     profiles.role（静的）ではなくtransaction_distributions（イベント単位の実績）で
 *     正しく振り分けられる（過去に実例あり: 20260727020000_fix_spacemind_hideaway_distribution_data.sql）
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertQrConfig,
  insertTransaction,
  insertDistribution,
  insertSettleTransfer,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

let adminProfileId: string;
let agentProfileId: string;
let organizerProfileId: string;
let eventId: string;
let qrConfigId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  distributionIds: [] as string[],
  settleTransferIds: [] as string[],
  payoutRequestIds: [] as string[],
};

beforeAll(async () => {
  adminProfileId = await insertProfile({ role: "admin", displayName: "テストAdmin", email: `income-admin-${Date.now()}@test.local` });
  agentProfileId = await insertProfile({ role: "agent", displayName: "テストAgent", email: `income-agent-${Date.now()}@test.local` });
  organizerProfileId = await insertProfile({ role: "organizer", displayName: "テストOrganizer", email: `income-organizer-${Date.now()}@test.local` });
  cleanup.profileIds.push(adminProfileId, agentProfileId, organizerProfileId);

  eventId = await insertEvent({ organizerProfileId, agentId: agentProfileId });
  cleanup.eventIds.push(eventId);

  qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
  cleanup.qrConfigIds.push(qrConfigId);
});

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

async function callSummary(profileIds: string[], startUtc: string, endUtc: string) {
  const { data, error } = await testAdmin.rpc("get_role_income_summary", {
    p_profile_ids: profileIds,
    p_start_utc: startUtc,
    p_end_utc: endUtc,
  });
  if (error) throw new Error(`RPC呼び出し失敗: ${error.message}`);
  return data as {
    platform: { gross: number; reversed: number; net: number };
    agent: { gross: number; reversed: number; net: number; outstanding_balance: number };
    organizer_artist: { gross: number; reversed: number; net: number; outstanding_balance: number };
    total_net: number;
  };
}

describe("get_role_income_summary", () => {
  it("TC-INCOME-01/02: platformは決済確定日、agent/organizerはsettle_transfers着金日で月判定される", async () => {
    // 決済確定: 7/31（8月の集計からは除外されるべき）
    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: 10000,
      netAmount: 8600,
      stripeFee: 396,
      platformFee: 1000,
      stripePaymentIntentId: `pi_income_${Date.now()}`,
    });
    cleanup.transactionIds.push(txId);
    await testAdmin.from("transactions").update({ created_at: "2026-07-31T23:00:00+09:00" }).eq("transaction_id", txId);

    const platformDistId = await insertDistribution({ transactionId: txId, eventId, profileId: adminProfileId, role: "platform", actualAmount: 500 });
    const agentDistId = await insertDistribution({ transactionId: txId, eventId, profileId: agentProfileId, role: "agent", actualAmount: 500 });
    const orgDistId = await insertDistribution({ transactionId: txId, eventId, profileId: organizerProfileId, role: "organizer", actualAmount: 9000 });
    cleanup.distributionIds.push(platformDistId, agentDistId, orgDistId);

    // settle_transfersの実着金日は8/5（8月の集計に含まれるべき）
    const agentTransferId = `tr_agent_${crypto.randomUUID()}`;
    const orgTransferId = `tr_org_${crypto.randomUUID()}`;
    await insertSettleTransfer({ eventId, profileId: agentProfileId, stripeTransferId: agentTransferId, amount: 500 });
    await insertSettleTransfer({ eventId, profileId: organizerProfileId, stripeTransferId: orgTransferId, amount: 9000 });
    await testAdmin.from("settle_transfers").update({ created_at: "2026-08-05T00:00:00+09:00" }).eq("stripe_transfer_id", agentTransferId);
    await testAdmin.from("settle_transfers").update({ created_at: "2026-08-05T00:00:00+09:00" }).eq("stripe_transfer_id", orgTransferId);
    cleanup.settleTransferIds.push(agentTransferId, orgTransferId);

    // 8月(JST) = 2026-07-31T15:00:00Z 〜 2026-08-31T15:00:00Z
    const augResult = await callSummary([adminProfileId], "2026-07-31T15:00:00Z", "2026-08-31T15:00:00Z");
    expect(augResult.platform.gross).toBe(0); // 決済確定は7/31なので8月には入らない

    const julResult = await callSummary([adminProfileId], "2026-06-30T15:00:00Z", "2026-07-31T15:00:00Z");
    expect(julResult.platform.gross).toBe(500); // 決済確定日(7/31)基準で7月に計上される

    const agentAugResult = await callSummary([agentProfileId], "2026-07-31T15:00:00Z", "2026-08-31T15:00:00Z");
    expect(agentAugResult.agent.gross).toBe(500); // 着金日(8/5)基準で8月に計上される

    const agentJulResult = await callSummary([agentProfileId], "2026-06-30T15:00:00Z", "2026-07-31T15:00:00Z");
    expect(agentJulResult.agent.gross).toBe(0); // 7月には着金していないので0

    const orgAugResult = await callSummary([organizerProfileId], "2026-07-31T15:00:00Z", "2026-08-31T15:00:00Z");
    expect(orgAugResult.organizer_artist.gross).toBe(9000);
  });

  it("TC-INCOME-03: reversedはtransaction_distributions.updated_atの月にマイナス計上される", async () => {
    // 他テスト(TC-01)と同じevent+profileを使い回すと、1つのevent+profileに対して
    // 異なる月に複数回settleが走るという非現実的な状態になり、集計が正しく検証
    // できない（実際の運用ではevent+profileの組み合わせごとに1回のsettleで
    // その時点の未送金額をまとめて送金する）。このテスト専用のprofile/eventを使う。
    const organizer3ProfileId = await insertProfile({ role: "organizer", displayName: "テストOrganizer3", email: `income-organizer3-${Date.now()}@test.local` });
    cleanup.profileIds.push(organizer3ProfileId);
    const event3Id = await insertEvent({ organizerProfileId: organizer3ProfileId, agentId: agentProfileId });
    cleanup.eventIds.push(event3Id);
    const qrConfig3Id = await insertQrConfig({ eventId: event3Id, creatorProfileId: organizer3ProfileId, recipientProfileId: organizer3ProfileId });
    cleanup.qrConfigIds.push(qrConfig3Id);

    const txId = await insertTransaction({
      qrConfigId: qrConfig3Id,
      grossAmount: 5000,
      netAmount: 4300,
      stripeFee: 198,
      platformFee: 500,
      stripePaymentIntentId: `pi_reversed_${Date.now()}`,
    });
    cleanup.transactionIds.push(txId);
    await testAdmin.from("transactions").update({ created_at: "2026-10-03T00:00:00+09:00" }).eq("transaction_id", txId);

    const distId = await insertDistribution({ transactionId: txId, eventId: event3Id, profileId: organizer3ProfileId, role: "organizer", actualAmount: 4300 });
    cleanup.distributionIds.push(distId);
    const revTransferId = `tr_rev_${crypto.randomUUID()}`;
    await insertSettleTransfer({ eventId: event3Id, profileId: organizer3ProfileId, stripeTransferId: revTransferId, amount: 4300 });
    await testAdmin.from("settle_transfers").update({ created_at: "2026-10-04T00:00:00+09:00" }).eq("stripe_transfer_id", revTransferId);
    cleanup.settleTransferIds.push(revTransferId);

    // reversed化（updated_atはtrg update_transaction_distributions_modtimeによりnow()に
    // 強制上書きされるため、過去日付を指定しても効かない）。
    // クエリ窓の境界はJS側のDate.now()ではなくDBが実際に書き込んだupdated_atから
    // 組み立てる（テスト実行環境とDBコンテナのクロックがズレていると、狭い窓で
    // JS側のnow()を使うと境界外にこぼれ落ちるため）。
    const { data: reversedRow } = await testAdmin
      .from("transaction_distributions")
      .update({ distribution_status: "reversed" })
      .eq("transaction_distribution_id", distId)
      .select("updated_at")
      .single();
    const reversedAt = new Date(reversedRow!.updated_at);
    const windowStart = new Date(reversedAt.getTime() - 1000);
    const windowEnd = new Date(reversedAt.getTime() + 1000);

    const nowResult = await callSummary([organizer3ProfileId], windowStart.toISOString(), windowEnd.toISOString());
    expect(nowResult.organizer_artist.reversed).toBe(4300); // reversedになった「今」の期間にマイナス計上対象として現れる
    expect(nowResult.organizer_artist.gross).toBe(0); // この期間には新規着金はない（着金は10月なので対象外）

    const octResult = await callSummary([organizer3ProfileId], "2026-09-30T15:00:00Z", "2026-10-31T15:00:00Z");
    expect(octResult.organizer_artist.gross).toBe(4300); // 10月の着金額はreversedでも変わらない
    expect(octResult.organizer_artist.net).toBe(4300); // 10月時点ではまだreverseされていない
  });

  it("TC-INCOME-04: voidedは集計対象外", async () => {
    const range = ["2026-08-31T15:00:00Z", "2026-09-30T15:00:00Z"] as const; // 他テストが使わない9月枠を使い干渉を避ける
    const before = await callSummary([adminProfileId], ...range);

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: 3000,
      netAmount: 2580,
      stripeFee: 120,
      platformFee: 300,
      stripePaymentIntentId: `pi_voided_${Date.now()}`,
    });
    cleanup.transactionIds.push(txId);
    await testAdmin.from("transactions").update({ created_at: "2026-09-03T00:00:00+09:00" }).eq("transaction_id", txId);

    const distId = await insertDistribution({ transactionId: txId, eventId, profileId: adminProfileId, role: "platform", actualAmount: 300 });
    cleanup.distributionIds.push(distId);
    await testAdmin.from("transaction_distributions").update({ distribution_status: "voided" }).eq("transaction_distribution_id", distId);

    const after = await callSummary([adminProfileId], ...range);
    expect(after.platform.gross).toBe(before.platform.gross); // voided分は加算されない
  });

  it("TC-INCOME-05: outstanding_balanceはロールごとに分離され、reversedも控除される", async () => {
    // 他テストのsettle_transfers累計と混ざらないよう、このテスト専用のprofileを使う
    // （outstanding_balanceは日付範囲でフィルタされない累計値のため、profile単位で完全に隔離する）
    const agent2ProfileId = await insertProfile({ role: "agent", displayName: "テストAgent2", email: `income-agent2-${Date.now()}@test.local` });
    const organizer2ProfileId = await insertProfile({ role: "organizer", displayName: "テストOrganizer2", email: `income-organizer2-${Date.now()}@test.local` });
    cleanup.profileIds.push(agent2ProfileId, organizer2ProfileId);

    const txId = await insertTransaction({
      qrConfigId,
      grossAmount: 20000,
      netAmount: 18000,
      stripeFee: 720,
      platformFee: 2000,
      stripePaymentIntentId: `pi_balance_${Date.now()}`,
    });
    cleanup.transactionIds.push(txId);

    // agent: 着金9000のうちpayoutなし → 残高9000
    const agentDistId = await insertDistribution({ transactionId: txId, eventId, profileId: agent2ProfileId, role: "agent", actualAmount: 9000 });
    cleanup.distributionIds.push(agentDistId);
    const agentTransferId = `tr_bal_agent_${crypto.randomUUID()}`;
    await insertSettleTransfer({ eventId, profileId: agent2ProfileId, stripeTransferId: agentTransferId, amount: 9000 });
    cleanup.settleTransferIds.push(agentTransferId);

    // organizer: 着金13300(9000+4300)のうち、4300が後日reversed・5000をpayout済み → 残高4000
    const orgDistId1 = await insertDistribution({ transactionId: txId, eventId, profileId: organizer2ProfileId, role: "organizer", actualAmount: 9000 });
    const orgDistId2 = await insertDistribution({ transactionId: txId, eventId, profileId: organizer2ProfileId, role: "organizer", actualAmount: 4300 });
    cleanup.distributionIds.push(orgDistId1, orgDistId2);
    await testAdmin
      .from("transaction_distributions")
      .update({ distribution_status: "reversed" })
      .eq("transaction_distribution_id", orgDistId2);

    const orgTransferId1 = `tr_bal_org1_${crypto.randomUUID()}`;
    const orgTransferId2 = `tr_bal_org2_${crypto.randomUUID()}`;
    await insertSettleTransfer({ eventId, profileId: organizer2ProfileId, stripeTransferId: orgTransferId1, amount: 9000 });
    await insertSettleTransfer({ eventId, profileId: organizer2ProfileId, stripeTransferId: orgTransferId2, amount: 4300 });
    cleanup.settleTransferIds.push(orgTransferId1, orgTransferId2);

    const { data: payoutRow, error: payoutErr } = await testAdmin
      .from("payout_requests")
      .insert({
        profile_id: organizer2ProfileId,
        requested_amount: 5000,
        stripe_fee_deducted: 500,
        net_payout_amount: 4500,
        status: "completed",
      })
      .select("request_id")
      .single();
    if (payoutErr) throw new Error(payoutErr.message);
    cleanup.payoutRequestIds.push(payoutRow.request_id);

    // agent + organizer 両方を1つのprofile群として渡し、残高がロールごとに正しく分離されるか検証
    const result = await callSummary([agent2ProfileId, organizer2ProfileId], "2026-01-01T00:00:00Z", "2026-12-31T15:00:00Z");
    expect(result.agent.outstanding_balance).toBe(9000);
    expect(result.organizer_artist.outstanding_balance).toBe(4000); // 9000+4300-4300(reversed)-5000(payout)
  });

  it("TC-INCOME-06: 同一profile(role='agent')がイベントBではorganizerとして分配を受けた場合、profiles.roleではなくイベント単位の実績で振り分けられる", async () => {
    const mixedProfileId = await insertProfile({ role: "agent", displayName: "テストMixedRole", email: `income-mixed-${Date.now()}@test.local` });
    cleanup.profileIds.push(mixedProfileId);

    // イベントA: 通常通りagentとして分配（共通eventIdを使用）
    const txA = await insertTransaction({
      qrConfigId,
      grossAmount: 6000,
      netAmount: 5160,
      stripeFee: 240,
      platformFee: 600,
      stripePaymentIntentId: `pi_mixed_a_${Date.now()}`,
    });
    cleanup.transactionIds.push(txA);
    const distA = await insertDistribution({ transactionId: txA, eventId, profileId: mixedProfileId, role: "agent", actualAmount: 600 });
    cleanup.distributionIds.push(distA);
    const transferA = `tr_mixed_a_${crypto.randomUUID()}`;
    await insertSettleTransfer({ eventId, profileId: mixedProfileId, stripeTransferId: transferA, amount: 600 });
    cleanup.settleTransferIds.push(transferA);

    // イベントB: この同一profileがorganizerとして分配を受ける（別イベント）
    const eventB = await insertEvent({ organizerProfileId: mixedProfileId, agentId: mixedProfileId });
    cleanup.eventIds.push(eventB);
    const qrConfigB = await insertQrConfig({ eventId: eventB, creatorProfileId: mixedProfileId, recipientProfileId: mixedProfileId });
    cleanup.qrConfigIds.push(qrConfigB);
    const txB = await insertTransaction({
      qrConfigId: qrConfigB,
      grossAmount: 10000,
      netAmount: 8600,
      stripeFee: 400,
      platformFee: 1000,
      stripePaymentIntentId: `pi_mixed_b_${Date.now()}`,
    });
    cleanup.transactionIds.push(txB);
    const distB = await insertDistribution({ transactionId: txB, eventId: eventB, profileId: mixedProfileId, role: "organizer", actualAmount: 8600 });
    cleanup.distributionIds.push(distB);
    const transferB = `tr_mixed_b_${crypto.randomUUID()}`;
    await insertSettleTransfer({ eventId: eventB, profileId: mixedProfileId, stripeTransferId: transferB, amount: 8600 });
    cleanup.settleTransferIds.push(transferB);

    const result = await callSummary([mixedProfileId], "2000-01-01T00:00:00Z", "2100-01-01T00:00:00Z");
    expect(result.agent.gross).toBe(600); // イベントAの分だけ
    expect(result.organizer_artist.gross).toBe(8600); // イベントBの分だけ（profiles.role='agent'に引きずられない）
  });
});
