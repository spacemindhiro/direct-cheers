/**
 * safeRedirectPath: ログイン前後の遷移先を自サイト内のパスに限定する（2026-10-11）
 */
import { describe, it, expect } from "vitest";
import { safeRedirectPath, DEFAULT_REDIRECT_PATH } from "@/lib/safe-redirect";

describe("safeRedirectPath — 自サイト内のパスはそのまま通す", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/tickets?page=2", "/tickets?page=2"],
    ["/join/ABC123", "/join/ABC123"],
    ["/c/0b1c/thanks?session_id={CHECKOUT_SESSION_ID}#top", "/c/0b1c/thanks?session_id={CHECKOUT_SESSION_ID}#top"],
    ["/@evil.com", "/@evil.com"], // origin と連結しても https://direct-cheers.com/@evil.com（自サイト内）
  ])("%s → %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});

describe("safeRedirectPath — 外部サイトへ飛ぶ値は既定の遷移先に置き換える", () => {
  it.each([
    "https://evil.com",
    "http://evil.com/dashboard",
    "//evil.com",
    "//evil.com/dashboard",
    "/\\evil.com",
    "\\\\evil.com",
    "@evil.com",          // `${origin}@evil.com` = https://direct-cheers.com@evil.com → evil.com
    ".evil.com",
    "evil.com",
    "javascript:alert(1)",
    "/\tevil",            // 制御文字
    "/\n//evil.com",
    "",
  ])("%j → 既定値", (input) => {
    expect(safeRedirectPath(input)).toBe(DEFAULT_REDIRECT_PATH);
  });

  it("文字列以外（null・undefined・配列）→ 既定値", () => {
    expect(safeRedirectPath(null)).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath(["/dashboard"])).toBe(DEFAULT_REDIRECT_PATH);
  });

  it("既定値は呼び出し側で指定できる", () => {
    expect(safeRedirectPath("https://evil.com", "/dashboard/collection")).toBe("/dashboard/collection");
  });
});
