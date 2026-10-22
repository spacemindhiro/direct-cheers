/**
 * TC-ADDRESS-JP: Google の住所を会場マスタの項目に分け、郵便番号の住所と照らし合わせる（lib/address-jp.ts）
 * チアリー(AI) の会場登録の代行で、間違った住所を登録しないための確認。
 */
import { describe, it, expect } from "vitest";
import { cleanFormatted, normalizePostal, splitAddress } from "@/lib/address-jp";

describe("TC-ADDRESS-JP-A: 郵便番号の正規化", () => {
  it("A-01: ハイフン・〒・全角を受け付け、7桁の数字にする", () => {
    expect(normalizePostal("150-0041")).toBe("1500041");
    expect(normalizePostal("〒１５０−００４１")).toBe("1500041");
    expect(normalizePostal("1500041")).toBe("1500041");
  });
  it("A-02: 7桁でなければ null", () => {
    expect(normalizePostal("150-004")).toBe(null);
    expect(normalizePostal("")).toBe(null);
    expect(normalizePostal(null)).toBe(null);
  });
});

describe("TC-ADDRESS-JP-B: Google の住所の表記を揃える", () => {
  it("B-01: 国名・郵便番号・空白を外し、全角数字と数字の間のダッシュを半角にする", () => {
    expect(cleanFormatted("日本、〒150-0041 東京都渋谷区神南１丁目１９−５")).toBe("東京都渋谷区神南1丁目19-5");
  });
  it("B-02: 国名・郵便番号が無い表記もそのまま揃える", () => {
    expect(cleanFormatted("神奈川県横浜市中区山下町２７９")).toBe("神奈川県横浜市中区山下町279");
  });
});

describe("TC-ADDRESS-JP-C: 分ける（郵便番号の住所と一致する）", () => {
  it("C-01: 東京の区：町名と番地に分かれる", () => {
    expect(splitAddress("日本、〒150-0041 東京都渋谷区神南１丁目１９−５", "150-0041", { prefecture: "東京都", city: "渋谷区", suburb: "神南" }))
      .toEqual({ ok: true, address: { postal_code: "150-0041", prefecture: "東京都", city: "渋谷区", town: "神南", line1: "1丁目19-5" } });
  });
  it("C-02: 政令市の区（市区町村が「横浜市中区」）", () => {
    expect(splitAddress("日本、〒231-0023 神奈川県横浜市中区山下町２７９", "231-0023", { prefecture: "神奈川県", city: "横浜市中区", suburb: "山下町" }))
      .toEqual({ ok: true, address: { postal_code: "231-0023", prefecture: "神奈川県", city: "横浜市中区", town: "山下町", line1: "279" } });
  });
  it("C-03: 郵便番号に町名が無い地域（町名は空、残りが番地）", () => {
    expect(splitAddress("日本、〒408-0000 山梨県北杜市大泉町西井出８２４０", "4080000", { prefecture: "山梨県", city: "北杜市", suburb: "" }))
      .toEqual({ ok: true, address: { postal_code: "408-0000", prefecture: "山梨県", city: "北杜市", town: null, line1: "大泉町西井出8240" } });
  });
});

describe("TC-ADDRESS-JP-D: 分けない（登録に進ませない）", () => {
  it("D-01: 都道府県・市区町村が郵便番号の住所と合わない", () => {
    expect(splitAddress("日本、〒150-0041 東京都新宿区西新宿２丁目８−１", "150-0041", { prefecture: "東京都", city: "渋谷区", suburb: "神南" }))
      .toEqual({ ok: false, reason: "mismatch" });
  });
  it("D-02: 郵便番号が無い", () => {
    expect(splitAddress("東京都渋谷区神南1丁目19-5", null, { prefecture: "東京都", city: "渋谷区", suburb: "神南" }))
      .toEqual({ ok: false, reason: "no_postal" });
  });
  it("D-03: 郵便番号の住所が引けない", () => {
    expect(splitAddress("東京都渋谷区神南1丁目19-5", "150-0041", null)).toEqual({ ok: false, reason: "zip_unknown" });
  });
  it("D-04: 番地が無い（町名で終わる）", () => {
    expect(splitAddress("日本、〒150-0041 東京都渋谷区神南", "150-0041", { prefecture: "東京都", city: "渋谷区", suburb: "神南" }))
      .toEqual({ ok: false, reason: "no_line1" });
  });
});
