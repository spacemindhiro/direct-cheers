import { describe, it, expect } from "vitest";
import { normalizeEmail, EMAIL_PATTERN } from "@/lib/normalize-email";

describe("normalizeEmail", () => {
  it("半角小文字の正常なアドレスはそのまま", () => {
    expect(normalizeEmail("tsekine1234@gmail.com")).toBe("tsekine1234@gmail.com");
  });

  it("全角＠・全角．・全角英数字を半角化する", () => {
    expect(normalizeEmail("ｔｓｅｋｉｎｅ１２３４＠ｇｍａｉｌ．ｃｏｍ")).toBe("tsekine1234@gmail.com");
  });

  it("大文字を小文字化する", () => {
    expect(normalizeEmail("TSekine1234@Gmail.COM")).toBe("tsekine1234@gmail.com");
  });

  it("ゼロ幅文字（ZWSP/ZWNJ/ZWJ/WJ/BOM）を除去する", () => {
    expect(normalizeEmail("﻿tsekine​1234@‌‍gmail⁠.com")).toBe("tsekine1234@gmail.com");
  });

  it("前後の半角・全角スペース・改行を除去する", () => {
    expect(normalizeEmail(" 　tsekine1234@gmail.com　\n")).toBe("tsekine1234@gmail.com");
  });

  it("空白のみは空文字になる", () => {
    expect(normalizeEmail("　 ​")).toBe("");
  });
});

describe("EMAIL_PATTERN", () => {
  it("正規化後のアドレスは通る", () => {
    expect(EMAIL_PATTERN.test(normalizeEmail("ｔｓｅｋｉｎｅ１２３４＠ｇｍａｉｌ．ｃｏｍ"))).toBe(true);
  });

  it("＠なし・ドメインのドットなし・途中スペースは弾く", () => {
    expect(EMAIL_PATTERN.test("not-an-email")).toBe(false);
    expect(EMAIL_PATTERN.test("a@localhost")).toBe(false);
    expect(EMAIL_PATTERN.test("a b@test.local")).toBe(false);
  });
});
