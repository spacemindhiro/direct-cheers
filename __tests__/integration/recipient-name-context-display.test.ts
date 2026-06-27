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
