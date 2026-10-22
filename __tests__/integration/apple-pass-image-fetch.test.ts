/**
 * TC-PASS-IMGFETCH: ウォレットカード作成時、サーバーが取りに行く画像は自分たちの Storage だけ — 2026-10-22
 *
 * 背景: generatePassBuffer / generateTicketPassBuffer は QR画像・帯画像・宛先のアバターをサーバーから取りに行く。
 * profiles.avatar_url は本人がDBへ直接書き込めるため、保存時の検証だけでは外部URLを防げない。
 * 取得の直前で isOwnStorageUrl を確かめ、外部URLは取りに行かず既定の画像でカードを作る。
 *
 * 証明書・署名（node-forge / passkit-generator）は差し替え、fetch は呼ばれたURLを記録する。
 *
 * カバレッジ:
 *   C. チアのカード: 自分たちの画像は取りに行く／外部URLは取りに行かずカードは作られる／DB直書きのアバターも同様
 *   T. チケットのカード: 帯画像で同じ
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import sharp from "sharp";
import {
  insertProfile,
  deleteAuthUsers,
  insertEvent,
  insertQrConfig,
  insertProduct,
  insertTransaction,
  insertTicket,
} from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";
import { storagePublicPrefix } from "@/lib/image-source";

vi.mock("node-forge", () => {
  const forge = {
    util: { createBuffer: () => ({}) },
    asn1: { fromDer: () => ({}) },
    pkcs12: {
      pkcs12FromAsn1: () => ({
        getBags: ({ bagType }: { bagType: string }) => ({ [bagType]: [{ cert: {}, key: {} }] }),
      }),
    },
    pki: {
      oids: { certBag: "certBag", pkcs8ShroudedKeyBag: "keyBag" },
      certificateToPem: () => "CERT",
      privateKeyToPem: () => "KEY",
    },
  };
  return { default: forge, ...forge };
});

const builtPasses: Record<string, Buffer>[] = [];
vi.mock("passkit-generator", () => ({
  PKPass: class {
    constructor(files: Record<string, Buffer>) { builtPasses.push(files); }
    getAsBuffer() { return Buffer.from("pkpass"); }
  },
}));

import { generatePassBuffer, generateTicketPassBuffer } from "@/lib/apple-pass-generator";

const OWN_QR = `${storagePublicPrefix("qr-images")}tc-pass-imgfetch/qr.jpg`;
const OWN_AVATAR = `${storagePublicPrefix("avatars")}tc-pass-imgfetch/a.webp`;
const EXT_QR = "https://evil.example.com/qr.jpg";
const EXT_AVATAR = "https://evil.example.com/avatar.jpg";

const realFetch = globalThis.fetch;
let fetched: string[] = [];
let png: Buffer;

let organizerId: string;
let artistId: string;
let eventId: string;

const cleanup = {
  profileIds: [] as string[],
  eventIds: [] as string[],
  qrConfigIds: [] as string[],
  productIds: [] as string[],
  transactionIds: [] as string[],
  ticketIds: [] as string[],
};

async function seedCheer(opts: { imageUrl: string | null; avatarUrl: string | null }) {
  await testAdmin.from("profiles").update({ avatar_url: opts.avatarUrl, artist_avatar_url: null }).eq("profile_id", artistId);
  const productId = await insertProduct({ eventId, name: "TC-PASS-IMGFETCH 商品", type: "standard", minAmount: 500, maxAmount: 3000 });
  const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerId, recipientProfileId: artistId, productId, recipientNameContext: "artist" });
  await testAdmin.from("qr_configs").update({ image_url: opts.imageUrl }).eq("qr_config_id", qrConfigId);
  const transactionId = await insertTransaction({
    qrConfigId, grossAmount: 1000, netAmount: 900, stripeFee: 36, platformFee: 64,
    stripePaymentIntentId: `pi_tc_pass_imgfetch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  });
  cleanup.productIds.push(productId);
  cleanup.qrConfigIds.push(qrConfigId);
  cleanup.transactionIds.push(transactionId);
  return transactionId;
}

async function seedTicket(stripImageUrl: string | null) {
  const productId = await insertProduct({ eventId, name: "TC-PASS-IMGFETCH 入場", type: "entrance", minAmount: 3000, maxAmount: 3000 });
  const qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerId, recipientProfileId: organizerId, productId });
  await testAdmin.from("qr_configs").update({ strip_image_url: stripImageUrl }).eq("qr_config_id", qrConfigId);
  const transactionId = await insertTransaction({
    qrConfigId, grossAmount: 3000, netAmount: 2700, stripeFee: 108, platformFee: 192,
    stripePaymentIntentId: `pi_tc_pass_imgfetch_t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  });
  const { ticketId } = await insertTicket({ eventId, productId, transactionId });
  cleanup.productIds.push(productId);
  cleanup.qrConfigIds.push(qrConfigId);
  cleanup.transactionIds.push(transactionId);
  cleanup.ticketIds.push(ticketId);
  return ticketId;
}

const imageFetches = () => fetched.filter((u) => !u.startsWith("https://www.apple.com/"));

beforeAll(async () => {
  png = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  vi.stubEnv("APPLE_PASS_CERTIFICATE_P12_BASE64", "dummy");
  vi.stubEnv("APPLE_PASS_TYPE_ID", "pass.test.tc-pass-imgfetch");
  vi.stubEnv("APPLE_TEAM_ID", "TESTTEAM");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    // Supabase（DB）への通信は本物に流す。それ以外（画像・Apple証明書）は記録して画像を返す
    if (url.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/`) || url.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/`)) {
      return realFetch(input, init);
    }
    fetched.push(url);
    return new Response(new Uint8Array(png), { status: 200, headers: { "Content-Type": "image/png" } });
  }));

  const ts = Date.now();
  organizerId = await insertProfile({ role: "organizer", displayName: "主催者", email: `org-passimg-${ts}@test.local` });
  artistId = await insertProfile({ role: "artist", displayName: "出演者", email: `artist-passimg-${ts}@test.local` });
  cleanup.profileIds.push(organizerId, artistId);
  eventId = await insertEvent({ organizerProfileId: organizerId, title: "TC-PASS-IMGFETCH イベント" });
  cleanup.eventIds.push(eventId);
}, 30_000);

beforeEach(() => {
  fetched = [];
  builtPasses.length = 0;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (cleanup.ticketIds.length) await testAdmin.from("tickets").delete().in("ticket_id", cleanup.ticketIds);
  if (cleanup.transactionIds.length) await testAdmin.from("transactions").delete().in("transaction_id", cleanup.transactionIds);
  if (cleanup.qrConfigIds.length) await testAdmin.from("qr_configs").delete().in("qr_config_id", cleanup.qrConfigIds);
  if (cleanup.productIds.length) await testAdmin.from("products").delete().in("product_id", cleanup.productIds);
  if (cleanup.eventIds.length) await testAdmin.from("events").delete().in("event_id", cleanup.eventIds);
  await deleteAuthUsers(cleanup.profileIds);
});

// ── C. チアのカード ──────────────────────────────────────────────────────
describe("TC-PASS-IMGFETCH-C: チアのカード", () => {
  it("TC-PASS-IMGFETCH-C-01: QR画像・アバターとも自分たちの Storage → 両方を取りに行く", async () => {
    const txId = await seedCheer({ imageUrl: OWN_QR, avatarUrl: OWN_AVATAR });
    const buf = await generatePassBuffer(txId);
    expect(buf.toString()).toBe("pkpass");
    expect(imageFetches().sort()).toEqual([OWN_AVATAR, OWN_AVATAR, OWN_QR].sort()); // ロゴは 1x・2x の2回
  });

  it("TC-PASS-IMGFETCH-C-02: QR画像・アバターとも外部URL → どちらも取りに行かず、カードは作られる", async () => {
    const txId = await seedCheer({ imageUrl: EXT_QR, avatarUrl: EXT_AVATAR });
    const buf = await generatePassBuffer(txId);
    expect(buf.toString()).toBe("pkpass");
    expect(imageFetches()).toEqual([]);
    expect(Object.keys(builtPasses[0]).sort()).toEqual([
      "icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png",
      "pass.json", "strip.png", "strip@2x.png", "strip@3x.png",
    ]);
  });

  it("TC-PASS-IMGFETCH-C-03: QR画像は自分たちの Storage、アバターだけDB直書きの外部URL → QR画像だけ取りに行く", async () => {
    const txId = await seedCheer({ imageUrl: OWN_QR, avatarUrl: EXT_AVATAR });
    await generatePassBuffer(txId);
    expect(imageFetches()).toEqual([OWN_QR]);
  });

  it("TC-PASS-IMGFETCH-C-04: アバターが qr-images（別バケット）を指している → アバターは取りに行かない", async () => {
    const txId = await seedCheer({ imageUrl: null, avatarUrl: OWN_QR });
    await generatePassBuffer(txId);
    expect(imageFetches()).toEqual([]);
  });
});

// ── T. チケットのカード ──────────────────────────────────────────────────
describe("TC-PASS-IMGFETCH-T: チケットのカード", () => {
  it("TC-PASS-IMGFETCH-T-01: 帯画像が自分たちの Storage → 取りに行く", async () => {
    const ticketId = await seedTicket(OWN_QR);
    const buf = await generateTicketPassBuffer(ticketId);
    expect(buf.toString()).toBe("pkpass");
    expect(imageFetches()).toEqual([OWN_QR]);
  });

  it("TC-PASS-IMGFETCH-T-02: 帯画像が外部URL → 取りに行かず、既定の帯画像でカードは作られる", async () => {
    const ticketId = await seedTicket(EXT_QR);
    const buf = await generateTicketPassBuffer(ticketId);
    expect(buf.toString()).toBe("pkpass");
    expect(imageFetches()).toEqual([]);
    // 既定の帯画像（背景色＋ロゴ）が 1125x294 で入っている
    const meta = await sharp(builtPasses[0]["strip@3x.png"]).metadata();
    expect([meta.width, meta.height]).toEqual([1125, 294]);
  });
});
