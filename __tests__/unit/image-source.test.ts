/**
 * TC-IMGSRC-U: QR画像の素材（宛先の画像）の選び方 — 2026-10-13
 * 名義の画像→基本の画像の順で選び、原本は「選ばれた画像と組の原本」だけを使う（混ぜない）。
 */
import { describe, it, expect } from "vitest";
import { pickAvatarSource, avatarFields, isValidFlyerUrl, storagePublicPrefix, isOwnStorageUrl, isValidQrImageUrl } from "@/lib/image-source";

const named = "https://x/named.webp";
const namedOrig = "https://x/named-original.webp";
const base = "https://x/base.webp";
const baseOrig = "https://x/base-original.webp";

describe("TC-IMGSRC-U-A: pickAvatarSource", () => {
  it("A-01: 名義の画像と原本あり → 名義の組", () => {
    expect(pickAvatarSource({ url: named, originalUrl: namedOrig }, { url: base, originalUrl: baseOrig }))
      .toEqual({ url: named, originalUrl: namedOrig });
  });
  it("A-02: 名義の画像あり・原本なし、基本には原本あり → 原本は null（基本の原本を混ぜない）", () => {
    expect(pickAvatarSource({ url: named, originalUrl: null }, { url: base, originalUrl: baseOrig }))
      .toEqual({ url: named, originalUrl: null });
  });
  it("A-03: 名義の画像なし（原本だけ残っていても）→ 基本の組", () => {
    expect(pickAvatarSource({ url: null, originalUrl: namedOrig }, { url: base, originalUrl: baseOrig }))
      .toEqual({ url: base, originalUrl: baseOrig });
  });
  it("A-04: 基本だけ・原本なし（既存ユーザー）→ 基本・原本 null", () => {
    expect(pickAvatarSource({ url: undefined, originalUrl: undefined }, { url: base, originalUrl: undefined }))
      .toEqual({ url: base, originalUrl: null });
  });
  it("A-05: どちらも無い → null", () => {
    expect(pickAvatarSource({ url: null, originalUrl: null }, { url: "", originalUrl: baseOrig })).toBe(null);
  });
  it("A-06: avatarFields は候補の形（avatar_url / avatar_original_url）で返す", () => {
    expect(avatarFields({ url: named, originalUrl: namedOrig }, { url: base, originalUrl: baseOrig }))
      .toEqual({ avatar_url: named, avatar_original_url: namedOrig });
    expect(avatarFields({ url: null, originalUrl: null }, { url: null, originalUrl: null }))
      .toEqual({ avatar_url: null, avatar_original_url: null });
  });
});

describe("TC-IMGSRC-U-B: isValidFlyerUrl", () => {
  const prefix = storagePublicPrefix("event-images");
  it.each([
    ["null（未設定）", null, true],
    ["event-images の画像", `${prefix}u/x.webp`, true],
    ["外部URL", "https://evil.example.com/x.webp", false],
    ["別バケット（avatars）", `${storagePublicPrefix("avatars")}u/x.webp`, false],
    ["空文字", "", false],
    ["数値", 1, false],
    ["undefined", undefined, false],
  ])("B: %s → %s", (_label, v, expected) => {
    expect(isValidFlyerUrl(v)).toBe(expected);
  });
});

// TC-IMGSRC-U-C/D: サーバーが取りに行く画像URLは自分たちの Storage だけ — 2026-10-22
// 外部URLを取りに行かせると SSRF・Node.js の応答展開処理の脆弱性（CVE-2026-111497）の入口になる
describe("TC-IMGSRC-U-C: isOwnStorageUrl", () => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const host = new URL(base).host;
  it.each([
    ["qr-images の画像（qr-images 指定）", `${storagePublicPrefix("qr-images")}u/x.jpg`, ["qr-images"], true],
    ["avatars の画像（avatars 指定）", `${storagePublicPrefix("avatars")}u/x.webp`, ["avatars"], true],
    ["複数バケット指定のどちらか", `${storagePublicPrefix("avatars")}u/x.webp`, ["qr-images", "avatars"], true],
    ["外部URL", "https://evil.example.com/x.jpg", ["qr-images"], false],
    ["自分のホストに見せかけた別ドメイン", `${base}.evil.example.com/storage/v1/object/public/qr-images/x.jpg`, ["qr-images"], false],
    ["ユーザー名部分に自分のホストを入れた別ドメイン", `https://${host}@evil.example.com/storage/v1/object/public/qr-images/x.jpg`, ["qr-images"], false],
    ["名前が前方一致する別バケット", `${base}/storage/v1/object/public/qr-images-evil/x.jpg`, ["qr-images"], false],
    ["指定外のバケット", `${storagePublicPrefix("avatars")}u/x.webp`, ["qr-images"], false],
    ["公開URLでない（署名付きURLの経路）", `${base}/storage/v1/object/sign/qr-images/x.jpg`, ["qr-images"], false],
    ["空文字", "", ["qr-images"], false],
    ["null", null, ["qr-images"], false],
    ["undefined", undefined, ["qr-images"], false],
    ["数値", 1, ["qr-images"], false],
  ])("C: %s → %s", (_label, v, buckets, expected) => {
    expect(isOwnStorageUrl(v, buckets as string[])).toBe(expected);
  });
});

describe("TC-IMGSRC-U-D: isValidQrImageUrl", () => {
  it.each([
    ["null（未設定・画像を外す）", null, true],
    ["qr-images の画像", `${storagePublicPrefix("qr-images")}u/x.jpg`, true],
    ["外部URL", "https://evil.example.com/x.jpg", false],
    ["avatars の画像（QR画像としては上げ直したものだけ）", `${storagePublicPrefix("avatars")}u/x.webp`, false],
    ["event-images の画像（フライヤーも切り抜いて上げ直す）", `${storagePublicPrefix("event-images")}e/x.webp`, false],
    ["空文字", "", false],
    ["undefined", undefined, false],
  ])("D: %s → %s", (_label, v, expected) => {
    expect(isValidQrImageUrl(v)).toBe(expected);
  });
});
