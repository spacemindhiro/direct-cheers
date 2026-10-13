/**
 * TC-IMGSRC-U: QR画像の素材（宛先の画像）の選び方 — 2026-10-13
 * 名義の画像→基本の画像の順で選び、原本は「選ばれた画像と組の原本」だけを使う（混ぜない）。
 */
import { describe, it, expect } from "vitest";
import { pickAvatarSource, avatarFields, isValidFlyerUrl, storagePublicPrefix } from "@/lib/image-source";

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
