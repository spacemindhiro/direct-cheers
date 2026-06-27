/**
 * TC-MATRIX: recipient_name_context（主催者/演者の名義区別）の【仕様マトリクス】を
 * 外部IF（Stripe・Wallet・コレクション画面）の出力に対して厳格固定する。
 *
 * 【仕様マトリクス】
 * 1. recipient_name_context='organizer' の場合:
 *    - Stripeの statement_descriptor_suffix は、profiles.organizer_name を
 *      サニタイズした値と100%完全一致する（events.title とは一致しない）。
 *    - resolveCheerPassIdentity（Walletパス相当）の name/avatarUrl は、
 *      profiles.organizer_name / organizer_avatar_url と100%完全一致する。
 * 2. recipient_name_context='artist' の場合:
 *    - Stripeの statement_descriptor_suffix は、profiles.artist_name を
 *      サニタイズした値と100%完全一致する。
 *    - resolveCheerPassIdentity の name/avatarUrl は、
 *      profiles.artist_name / artist_avatar_url と100%完全一致する。
 *
 * 「値が存在すること」だけのtoBeDefined()チェックは使わない。常にテストデータの
 * 動的変数そのもの（organizerName/artistName等の変数）と.toBe()で直接比較する。
 *
 * エッジケース（依存関係を破壊したフィクスチャ・3パターン）:
 *   A. プロフィール挿入順序を通常と逆にする（artist→organizerではなくorganizer→artist
 *      ではない順序、かつ「先に作ったプロフィールに後からorganizer_name/artist_nameを
 *      追記する」運用を模す）
 *   B. 同一イベントで、同じrecipient_profile_idがorganizer文脈・artist文脈の両方の
 *      QRに紐づき、どちらのtransactionにもtransaction_distributionsがstatus='accrued'
 *      で存在する（決済が分配確定前の状態でも名義解決が壊れないことを確認）
 *   C. 宛先（recipient_profile_id）は存在するが、organizer_name/artist_nameが
 *      どちらも未設定（display_nameのみ）のケース。display_nameへの
 *      フォールバックがcontextに関わらず正しく働くことを確認する
 *      （qr_configs.recipient_profile_idはDBスキーマ上NOT NULL制約があるため、
 *      「宛先自体が存在しない」ケースは本番では発生しない設計になっている。
 *      そのためproduct.artistへのフォールバックはユニットテスト（TC-SD-07）で
 *      別途検証し、ここでは実際に発生し得るエッジケースを検証する）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile, deleteAuthUsers, insertEvent, insertQrConfig,
  insertTransaction, insertDistribution,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

// ── Stripe（pay/cheers route）のモック ──────────────────────────────────
const captured: { sessionCreateParams?: any } = {};

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class InstrumentedStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      const origCreate = this.checkout.sessions.create.bind(this.checkout.sessions);
      (this.checkout.sessions as any).create = async (params: any, opts?: any) => {
        captured.sessionCreateParams = params;
        return origCreate(params, opts);
      };
      (this.accounts as any).retrieve = async (id: string) => ({
        id, object: "account",
        capabilities: { card_payments: "active", transfers: "active" },
      });
    }
  }
  return { ...StripeModule, default: InstrumentedStripe };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

import { POST as cheersPOST } from "@/app/api/pay/cheers/route";
import { resolveCheerPassIdentity } from "@/lib/apple-pass-generator";
import { sanitizeStatementDescriptorSuffix } from "@/lib/statement-descriptor";
import { createTestConnectAccount, deleteTestConnectAccount } from "../helpers/stripe-fixtures";

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  productIds: [] as string[],
  distributionIds: [] as string[],
};

async function makeQrCheersRequest(qrConfigId: string) {
  const req = new Request("http://localhost/api/pay/cheers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      qr_config_id: qrConfigId,
      product_id: crypto.randomUUID(),
      amount: 1_000,
      payment_method: "card",
    }),
  });
  return cheersPOST(req);
}

afterAll(async () => {
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── パターンA: プロフィール挿入順序を入れ替える ──────────────────────────
describe("TC-MATRIX-A: 挿入順序を入れ替えても解決結果は変わらない", () => {
  let organizerConnectId: string;
  let organizerProfileId: string;
  let eventId: string;
  let qrOrganizerConfigId: string;
  let qrArtistConfigId: string;

  const organizerName = "MATRIX-A SPACE BBQ運営委員会";
  const artistName = "MATRIX-A DJ HIRO";
  const organizerAvatarUrl = "https://example.com/matrix-a-organizer.webp";
  const artistAvatarUrl = "https://example.com/matrix-a-artist.webp";
  const eventTitle = "MATRIX-A FESTIVAL（イベント名はsuffixに出てはならない）";

  beforeAll(async () => {
    organizerConnectId = await createTestConnectAccount();
    const ts = Date.now();

    // 先に「名前を一切設定しないプロフィール」を作り、後から
    // organizer_name/artist_nameをまとめてUPDATEする（通常の登録フローとは逆順）。
    organizerProfileId = await insertProfile({
      role: "organizer", displayName: "MATRIX-A 兼任オーガナイザー",
      email: `matrix-a-${ts}@test.local`, stripeConnectId: organizerConnectId,
    });
    cleanup.profileIds.push(organizerProfileId);

    eventId = await insertEvent({ organizerProfileId, title: eventTitle });
    cleanup.eventIds.push(eventId);

    // artist_name を先に更新し、organizer_name は後から更新する（逆順）
    await testAdmin.from("profiles").update({ artist_name: artistName, artist_avatar_url: artistAvatarUrl }).eq("profile_id", organizerProfileId);
    await testAdmin.from("profiles").update({ organizer_name: organizerName, organizer_avatar_url: organizerAvatarUrl }).eq("profile_id", organizerProfileId);

    // artist文脈のQRを先に作り、organizer文脈のQRを後で作る（逆順）
    qrArtistConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    await testAdmin.from("qr_configs").update({ recipient_name_context: "artist" }).eq("qr_config_id", qrArtistConfigId);
    cleanup.qrConfigIds.push(qrArtistConfigId);

    qrOrganizerConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    await testAdmin.from("qr_configs").update({ recipient_name_context: "organizer" }).eq("qr_config_id", qrOrganizerConfigId);
    cleanup.qrConfigIds.push(qrOrganizerConfigId);
  }, 30_000);

  afterAll(async () => {
    await deleteTestConnectAccount(organizerConnectId);
  });

  it("organizer文脈: Stripe suffixはsanitize(organizer_name)と完全一致し、event.titleとは不一致", async () => {
    const res = await makeQrCheersRequest(qrOrganizerConfigId);
    expect(res.status).toBe(200);
    const pid = captured.sessionCreateParams?.payment_intent_data;
    const expectedSuffix = sanitizeStatementDescriptorSuffix(organizerName, 19);
    expect(pid?.statement_descriptor_suffix).toBe(expectedSuffix);
    expect(pid?.statement_descriptor_suffix).not.toBe(sanitizeStatementDescriptorSuffix(eventTitle, 19));
  });

  it("artist文脈: Stripe suffixはsanitize(artist_name)と完全一致", async () => {
    const res = await makeQrCheersRequest(qrArtistConfigId);
    expect(res.status).toBe(200);
    const pid = captured.sessionCreateParams?.payment_intent_data;
    const expectedSuffix = sanitizeStatementDescriptorSuffix(artistName, 19);
    expect(pid?.statement_descriptor_suffix).toBe(expectedSuffix);
  });

  it("organizer文脈: resolveCheerPassIdentityのname/avatarUrlはorganizer_name/organizer_avatar_urlと完全一致", async () => {
    const { data: qrc } = await testAdmin.from("qr_configs")
      .select("recipient_profile_id, recipient_name_context")
      .eq("qr_config_id", qrOrganizerConfigId).single();
    const { name, avatarUrl } = await resolveCheerPassIdentity(testAdmin as any, {
      product: { artist: null },
      qr_config: qrc as any,
    });
    expect(name).toBe(organizerName);
    expect(avatarUrl).toBe(organizerAvatarUrl);
    expect(name).not.toBe(artistName);
    expect(avatarUrl).not.toBe(artistAvatarUrl);
  });

  it("artist文脈: resolveCheerPassIdentityのname/avatarUrlはartist_name/artist_avatar_urlと完全一致", async () => {
    const { data: qrc } = await testAdmin.from("qr_configs")
      .select("recipient_profile_id, recipient_name_context")
      .eq("qr_config_id", qrArtistConfigId).single();
    const { name, avatarUrl } = await resolveCheerPassIdentity(testAdmin as any, {
      product: { artist: null },
      qr_config: qrc as any,
    });
    expect(name).toBe(artistName);
    expect(avatarUrl).toBe(artistAvatarUrl);
    expect(name).not.toBe(organizerName);
    expect(avatarUrl).not.toBe(organizerAvatarUrl);
  });
});

// ── パターンB: 両方のtransactionがdistribution_status='accrued' ──────────
describe("TC-MATRIX-B: 双方のtransactionがaccrued状態でも名義解決が壊れない", () => {
  let organizerConnectId: string;
  let organizerProfileId: string;
  let eventId: string;
  let qrOrganizerConfigId: string;
  let qrArtistConfigId: string;
  let txOrganizerId: string;
  let txArtistId: string;

  const organizerName = "MATRIX-B SPACE BBQ運営委員会";
  const artistName = "MATRIX-B DJ HIRO";
  const organizerAvatarUrl = "https://example.com/matrix-b-organizer.webp";
  const artistAvatarUrl = "https://example.com/matrix-b-artist.webp";

  beforeAll(async () => {
    organizerConnectId = await createTestConnectAccount();
    const ts = Date.now();

    organizerProfileId = await insertProfile({
      role: "organizer", displayName: "MATRIX-B 兼任オーガナイザー",
      email: `matrix-b-${ts}@test.local`, stripeConnectId: organizerConnectId,
    });
    cleanup.profileIds.push(organizerProfileId);
    await testAdmin.from("profiles").update({
      organizer_name: organizerName, artist_name: artistName,
      organizer_avatar_url: organizerAvatarUrl, artist_avatar_url: artistAvatarUrl,
    }).eq("profile_id", organizerProfileId);

    eventId = await insertEvent({ organizerProfileId, title: "MATRIX-B FESTIVAL" });
    cleanup.eventIds.push(eventId);

    qrOrganizerConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    await testAdmin.from("qr_configs").update({ recipient_name_context: "organizer" }).eq("qr_config_id", qrOrganizerConfigId);
    cleanup.qrConfigIds.push(qrOrganizerConfigId);

    qrArtistConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId });
    await testAdmin.from("qr_configs").update({ recipient_name_context: "artist" }).eq("qr_config_id", qrArtistConfigId);
    cleanup.qrConfigIds.push(qrArtistConfigId);

    // 同じprofile_idに対する2件のtransactionを作り、両方を distribution_status='accrued' にする
    txOrganizerId = await insertTransaction({
      qrConfigId: qrOrganizerConfigId, grossAmount: 1000, netAmount: 900, stripeFee: 40, platformFee: 60,
      stripePaymentIntentId: `pi_matrix_b_organizer_${ts}`,
    });
    cleanup.transactionIds.push(txOrganizerId);
    const distOrgId = await insertDistribution({
      transactionId: txOrganizerId, eventId, profileId: organizerProfileId,
      role: "organizer", actualAmount: 900, status: "accrued",
    });
    cleanup.distributionIds.push(distOrgId);

    txArtistId = await insertTransaction({
      qrConfigId: qrArtistConfigId, grossAmount: 2000, netAmount: 1800, stripeFee: 80, platformFee: 120,
      stripePaymentIntentId: `pi_matrix_b_artist_${ts}`,
    });
    cleanup.transactionIds.push(txArtistId);
    const distArtistId = await insertDistribution({
      transactionId: txArtistId, eventId, profileId: organizerProfileId,
      role: "artist", actualAmount: 1800, status: "accrued",
    });
    cleanup.distributionIds.push(distArtistId);
  }, 30_000);

  afterAll(async () => {
    await deleteTestConnectAccount(organizerConnectId);
  });

  it("organizer文脈のtransaction（accrued）→ Stripe suffix・Walletパス名義ともにorganizer_nameと完全一致", async () => {
    const res = await makeQrCheersRequest(qrOrganizerConfigId);
    expect(res.status).toBe(200);
    const pid = captured.sessionCreateParams?.payment_intent_data;
    expect(pid?.statement_descriptor_suffix).toBe(sanitizeStatementDescriptorSuffix(organizerName, 19));

    const { data: qrc } = await testAdmin.from("qr_configs")
      .select("recipient_profile_id, recipient_name_context")
      .eq("qr_config_id", qrOrganizerConfigId).single();
    const { name, avatarUrl } = await resolveCheerPassIdentity(testAdmin as any, { product: { artist: null }, qr_config: qrc as any });
    expect(name).toBe(organizerName);
    expect(avatarUrl).toBe(organizerAvatarUrl);

    // accrued状態であることを前提条件として明示的に確認（フィクスチャの破壊耐性）
    const { data: dist } = await testAdmin.from("transaction_distributions")
      .select("distribution_status").eq("transaction_id", txOrganizerId).single();
    expect(dist?.distribution_status).toBe("accrued");
  });

  it("artist文脈のtransaction（accrued）→ Stripe suffix・Walletパス名義ともにartist_nameと完全一致", async () => {
    const res = await makeQrCheersRequest(qrArtistConfigId);
    expect(res.status).toBe(200);
    const pid = captured.sessionCreateParams?.payment_intent_data;
    expect(pid?.statement_descriptor_suffix).toBe(sanitizeStatementDescriptorSuffix(artistName, 19));

    const { data: qrc } = await testAdmin.from("qr_configs")
      .select("recipient_profile_id, recipient_name_context")
      .eq("qr_config_id", qrArtistConfigId).single();
    const { name, avatarUrl } = await resolveCheerPassIdentity(testAdmin as any, { product: { artist: null }, qr_config: qrc as any });
    expect(name).toBe(artistName);
    expect(avatarUrl).toBe(artistAvatarUrl);

    const { data: dist } = await testAdmin.from("transaction_distributions")
      .select("distribution_status").eq("transaction_id", txArtistId).single();
    expect(dist?.distribution_status).toBe("accrued");
  });
});

// ── パターンC: organizer_name/artist_nameが未設定 → display_nameへフォールバック ──
describe("TC-MATRIX-C: 名前未設定（display_nameのみ）の宛先は、contextに関わらずdisplay_nameに完全一致する", () => {
  let organizerProfileId: string;
  let unnamedRecipientProfileId: string;
  let eventId: string;
  let qrOrganizerConfigId: string;
  let qrArtistConfigId: string;

  const recipientDisplayName = "MATRIX-C 名前未設定ユーザー";

  beforeAll(async () => {
    const ts = Date.now();
    organizerProfileId = await insertProfile({
      role: "organizer", displayName: "MATRIX-C オーガナイザー", email: `matrix-c-org-${ts}@test.local`,
    });
    cleanup.profileIds.push(organizerProfileId);

    // organizer_name/artist_name/avatar系を一切設定しないプロフィール
    // （新規登録直後でまだ名前を設定していないユーザーを想定）
    unnamedRecipientProfileId = await insertProfile({
      role: "artist", displayName: recipientDisplayName, email: `matrix-c-unnamed-${ts}@test.local`,
    });
    cleanup.profileIds.push(unnamedRecipientProfileId);

    eventId = await insertEvent({ organizerProfileId, title: "MATRIX-C FESTIVAL" });
    cleanup.eventIds.push(eventId);

    qrOrganizerConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: unnamedRecipientProfileId });
    await testAdmin.from("qr_configs").update({ recipient_name_context: "organizer" }).eq("qr_config_id", qrOrganizerConfigId);
    cleanup.qrConfigIds.push(qrOrganizerConfigId);

    qrArtistConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerProfileId, recipientProfileId: unnamedRecipientProfileId });
    await testAdmin.from("qr_configs").update({ recipient_name_context: "artist" }).eq("qr_config_id", qrArtistConfigId);
    cleanup.qrConfigIds.push(qrArtistConfigId);
  }, 30_000);

  it("organizer文脈・名前未設定 → resolveCheerPassIdentityのnameはdisplay_nameと完全一致、avatarUrlはnull", async () => {
    const { data: qrc } = await testAdmin.from("qr_configs")
      .select("recipient_profile_id, recipient_name_context")
      .eq("qr_config_id", qrOrganizerConfigId).single();
    const { name, avatarUrl } = await resolveCheerPassIdentity(testAdmin as any, { product: { artist: null }, qr_config: qrc as any });
    expect(name).toBe(recipientDisplayName);
    expect(avatarUrl).toBeNull();
  });

  it("artist文脈・名前未設定 → resolveCheerPassIdentityのnameはdisplay_nameと完全一致（organizer文脈と同じ結果になる）", async () => {
    const { data: qrc } = await testAdmin.from("qr_configs")
      .select("recipient_profile_id, recipient_name_context")
      .eq("qr_config_id", qrArtistConfigId).single();
    const { name, avatarUrl } = await resolveCheerPassIdentity(testAdmin as any, { product: { artist: null }, qr_config: qrc as any });
    expect(name).toBe(recipientDisplayName);
    expect(avatarUrl).toBeNull();
  });
});
