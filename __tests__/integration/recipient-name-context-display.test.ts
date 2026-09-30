/**
 * TC-RNC: recipient_name_context（主催者/演者の名義区別）が表示系の全箇所で
 * 名前・画像ともに正しく解決されることを検証する。
 *
 * 背景: 主催者がDJ等を兼任している場合、同じ profile_id でも
 * recipient_name_context によって「主催者名義」か「演者名義」かが変わる。
 * Stripeのstatement_descriptorではこの区別が実装済みだったが、決済完了後の
 * 表示系（/api/pay/complete のレスポンス・受領メール・ウォレットパス・
 * オーガナイザーのライブ集計画面）では同じ区別ロジックが漏れており、
 * 常にartist_name（無ければdisplay_name）を表示していた。さらに画像も
 * organizer_avatar_url/artist_avatar_urlという別フィールドを持てるように
 * なったため、名前と同じ区別ロジックが画像にも必要になった。
 *
 * このテストは /api/pay/complete のレスポンス（recipient_name/recipient_avatar）が
 * resolveStatementDescriptorSource・resolveRecipientAvatarUrl と同じ区別ロジックで
 * 解決されることを固定する（lib/apple-pass-generator.ts・live-stats route も
 * 同じ関数を再利用しているため、ここでの保証が他の表示箇所にも及ぶ）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertQrConfig,
  insertProduct,
} from "../helpers/seed";
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));

const captured: {
  fakePiId: string;
  fakeMetadata: Record<string, string>;
} = { fakePiId: "", fakeMetadata: {} };

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class InstrumentedStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.checkout.sessions as any).retrieve = async (id: string, _opts?: any) => ({
        id,
        payment_status: "paid",
        payment_intent: { id: captured.fakePiId, status: "succeeded", latest_charge: null },
        customer_email: "rnc-test@test.local",
        customer: null,
        amount_total: 1000,
        payment_method_types: ["card"],
        metadata: captured.fakeMetadata,
      });
    }
  }
  return { ...StripeModule, default: InstrumentedStripe };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

import { POST as completePOST } from "@/app/api/pay/complete/route";

let organizerProfileId: string;
let eventId: string;
let cheersProductId: string;
let qrOrganizerConfigId: string;
let qrArtistConfigId: string;
// TC-RNC-02 用：products.artist_id に紐づくプロフィール（メッセージ欄・フォロー欄の名前の出どころ）
let artistWithNameProfileId: string;
let artistNoNameProfileId: string;
let productArtistNamedId: string;
let productArtistUnnamedId: string;
let productNoArtistId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  transactionIds: [] as string[],
  productIds: [] as string[],
};

beforeAll(async () => {
  const ts = Date.now();
  organizerProfileId = await insertProfile({
    role: "organizer",
    displayName: "兼任オーガナイザー（RNCテスト）",
    email: `organizer-rnc-${ts}@test.local`,
  });
  cleanup.profileIds.push(organizerProfileId);
  await testAdmin.from("profiles").update({
    organizer_name: "SPACE BBQ",
    artist_name: "DJ HIRO",
    organizer_avatar_url: "https://example.com/organizer.webp",
    artist_avatar_url: "https://example.com/artist.webp",
  }).eq("profile_id", organizerProfileId);

  eventId = await insertEvent({ organizerProfileId, title: "TC-RNC テストイベント" });
  cleanup.eventIds.push(eventId);

  cheersProductId = await insertProduct({ eventId, type: "standard", paymentType: "B", name: "TC-RNC チアーズ" });
  cleanup.productIds.push(cheersProductId);

  // 同じ profile_id を recipient に持つが、名義コンテキストが異なる2つのQR
  qrOrganizerConfigId = await insertQrConfig({
    eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId,
  });
  await testAdmin.from("qr_configs").update({ recipient_name_context: "organizer" }).eq("qr_config_id", qrOrganizerConfigId);
  cleanup.qrConfigIds.push(qrOrganizerConfigId);

  qrArtistConfigId = await insertQrConfig({
    eventId, creatorProfileId: organizerProfileId, recipientProfileId: organizerProfileId,
  });
  await testAdmin.from("qr_configs").update({ recipient_name_context: "artist" }).eq("qr_config_id", qrArtistConfigId);
  cleanup.qrConfigIds.push(qrArtistConfigId);

  // --- TC-RNC-02: products.artist_id 経由の artist_name 解決 ---
  // artist_name を設定したアーティスト
  artistWithNameProfileId = await insertProfile({
    role: "artist",
    displayName: "本名タロウ（RNCテスト）",
    email: `artist-named-rnc-${ts}@test.local`,
  });
  cleanup.profileIds.push(artistWithNameProfileId);
  await testAdmin.from("profiles").update({ artist_name: "LUNA ORBIT" }).eq("profile_id", artistWithNameProfileId);

  // artist_name 未設定のアーティスト（display_name へフォールバックする想定）
  artistNoNameProfileId = await insertProfile({
    role: "artist",
    displayName: "名無しジロウ（RNCテスト）",
    email: `artist-unnamed-rnc-${ts}@test.local`,
  });
  cleanup.profileIds.push(artistNoNameProfileId);
  await testAdmin.from("profiles").update({ artist_name: null }).eq("profile_id", artistNoNameProfileId);

  productArtistNamedId = await insertProduct({ eventId, type: "message", paymentType: "B", name: "TC-RNC メッセージ（名前あり）", artistId: artistWithNameProfileId });
  cleanup.productIds.push(productArtistNamedId);
  productArtistUnnamedId = await insertProduct({ eventId, type: "message", paymentType: "B", name: "TC-RNC メッセージ（名前なし）", artistId: artistNoNameProfileId });
  cleanup.productIds.push(productArtistUnnamedId);
  productNoArtistId = await insertProduct({ eventId, type: "message", paymentType: "B", name: "TC-RNC メッセージ（紐付けなし）", artistId: null });
  cleanup.productIds.push(productNoArtistId);
}, 30_000);

afterAll(async () => {
  if (cleanup.productIds.length) {
    await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  }
  await cleanupTestData(cleanup);
  await deleteAuthUsers(cleanup.profileIds);
});

function makeReq(): Request {
  return new Request("http://localhost/api/pay/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: "cs_test_rnc_mock" }),
  });
}

describe("TC-RNC-01: 同じprofile_idでも、recipient_name_contextに応じて表示名が変わる", () => {
  it("recipient_name_context='organizer' → recipient_nameはorganizer_name（SPACE BBQ）になる", async () => {
    const fakePiId = `pi_rnc_org_${Date.now()}`;
    captured.fakePiId = fakePiId;
    captured.fakeMetadata = { product_id: cheersProductId, qr_config_id: qrOrganizerConfigId };

    const res = await completePOST(makeReq());
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.transactionIds.push(data.transaction_id);

    expect(data.recipient_name).toBe("SPACE BBQ");
    expect(data.recipient_avatar).toBe("https://example.com/organizer.webp");
  });

  it("recipient_name_context='artist' → recipient_nameはartist_name（DJ HIRO）になる", async () => {
    const fakePiId = `pi_rnc_artist_${Date.now()}`;
    captured.fakePiId = fakePiId;
    captured.fakeMetadata = { product_id: cheersProductId, qr_config_id: qrArtistConfigId };

    const res = await completePOST(makeReq());
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.transactionIds.push(data.transaction_id);

    expect(data.recipient_name).toBe("DJ HIRO");
    expect(data.recipient_avatar).toBe("https://example.com/artist.webp");
  });
});

/**
 * TC-RNC-02: 決済完了画面のメッセージ欄・フォロー欄に出る artist_name。
 *
 * 背景（2026-09-30 の収録中に発覚）: getProductInfo の select が display_name しか
 * 取得しておらず、artist_name というキーに display_name を詰めて返していた。
 * cheers!カード側は recipient_name を先に見るため正しいアーティスト名が出るのに、
 * メッセージ欄（「◯◯ へ一言添えることができます」）とフォロー欄だけが
 * アカウントの表示名になり、同じ画面で名前が食い違っていた。
 */
describe("TC-RNC-02: products.artist_id の artist_name が完了画面に返る", () => {
  it("artist_name 設定あり → display_name ではなく artist_name（LUNA ORBIT）が返る", async () => {
    captured.fakePiId = `pi_rnc_an_named_${Date.now()}`;
    captured.fakeMetadata = { product_id: productArtistNamedId, qr_config_id: qrArtistConfigId };

    const res = await completePOST(makeReq());
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.transactionIds.push(data.transaction_id);

    const { data: prof } = await testAdmin
      .from("profiles")
      .select("artist_name, display_name")
      .eq("profile_id", artistWithNameProfileId)
      .single();
    expect(data.artist_name).toBe(prof!.artist_name);
    expect(data.artist_name).toBe("LUNA ORBIT");
    expect(data.artist_name).not.toBe(prof!.display_name);
  });

  it("artist_name 未設定 → display_name にフォールバックする", async () => {
    captured.fakePiId = `pi_rnc_an_unnamed_${Date.now()}`;
    captured.fakeMetadata = { product_id: productArtistUnnamedId, qr_config_id: qrArtistConfigId };

    const res = await completePOST(makeReq());
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.transactionIds.push(data.transaction_id);

    const { data: prof } = await testAdmin
      .from("profiles")
      .select("artist_name, display_name")
      .eq("profile_id", artistNoNameProfileId)
      .single();
    expect(prof!.artist_name).toBe(null);
    expect(data.artist_name).toBe(prof!.display_name);
    expect(data.artist_name).toBe("名無しジロウ（RNCテスト）");
  });

  it("artist_id 紐付けなし → artist_name は null（フォロー欄自体が出ない条件）", async () => {
    captured.fakePiId = `pi_rnc_an_noartist_${Date.now()}`;
    captured.fakeMetadata = { product_id: productNoArtistId, qr_config_id: qrArtistConfigId };

    const res = await completePOST(makeReq());
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.transactionIds.push(data.transaction_id);

    expect(data.artist_id).toBe(null);
    expect(data.artist_name).toBe(null);
  });

  it("同じ画面の recipient_name と artist_name が食い違わない（カードとメッセージ欄の一致）", async () => {
    captured.fakePiId = `pi_rnc_an_consistent_${Date.now()}`;
    captured.fakeMetadata = { product_id: productArtistNamedId, qr_config_id: qrArtistConfigId };

    const res = await completePOST(makeReq());
    const data = await res.json();
    expect(res.status).toBe(200);
    cleanup.transactionIds.push(data.transaction_id);

    // qrArtistConfigId の受取人は organizerProfileId（artist_name = DJ HIRO）なので
    // カード側は DJ HIRO、メッセージ欄は商品のアーティスト LUNA ORBIT。
    // どちらも display_name（本名）ではないことを固定する
    expect(data.recipient_name).toBe("DJ HIRO");
    expect(data.artist_name).toBe("LUNA ORBIT");
    expect(data.recipient_name).not.toBe("兼任オーガナイザー（RNCテスト）");
    expect(data.artist_name).not.toBe("本名タロウ（RNCテスト）");
  });
});
