/**
 * TC-SD: lib/statement-descriptor.ts のユニットテスト
 *
 * statement_descriptor_suffix は Stripe の制約上、半角英数字と
 * ". , - 空白" のみ・19文字以内でなければならない。
 * 日本語（かな・漢字）はASCII変換できないため除去され、結果が
 * 空文字になった場合は suffix 自体を省略する（undefined/null を返す）。
 */
import { describe, it, expect } from "vitest";
import {
  sanitizeStatementDescriptorSuffix,
  sanitizeStatementDescriptorSuffixKanji,
  resolveStatementDescriptorSource,
  buildStatementDescriptorSuffix,
  buildStatementDescriptorSuffixes,
  combineDescriptorPreview,
  PLATFORM_PREFIX,
  STATEMENT_DESCRIPTOR_TOTAL_MAX,
} from "@/lib/statement-descriptor";

describe("TC-SD-01: sanitizeStatementDescriptorSuffix", () => {
  it("半角英数字はそのまま大文字化される", () => {
    expect(sanitizeStatementDescriptorSuffix("dj hiro")).toBe("DJ HIRO");
  });

  it("許可された記号（. , -）は残る", () => {
    expect(sanitizeStatementDescriptorSuffix("DJ-HIRO, INC.")).toBe("DJ-HIRO, INC.");
  });

  it("許可されない記号は除去される", () => {
    expect(sanitizeStatementDescriptorSuffix("DJ'S HIRO!! #1")).toBe("DJS HIRO 1");
  });

  it("全角英数字は半角に変換される", () => {
    expect(sanitizeStatementDescriptorSuffix("ＤＪ ＨＩＲＯ２０２６")).toBe("DJ HIRO2026");
  });

  it("かな・漢字は除去される", () => {
    expect(sanitizeStatementDescriptorSuffix("DJヒロ宇宙")).toBe("DJ");
  });

  it("ASCII変換できる文字が全くない場合は null を返す", () => {
    expect(sanitizeStatementDescriptorSuffix("宇宙イベント")).toBeNull();
  });

  it("空文字・null・undefined は null を返す", () => {
    expect(sanitizeStatementDescriptorSuffix("")).toBeNull();
    expect(sanitizeStatementDescriptorSuffix(null)).toBeNull();
    expect(sanitizeStatementDescriptorSuffix(undefined)).toBeNull();
  });

  it("連続する空白は1つに圧縮される", () => {
    expect(sanitizeStatementDescriptorSuffix("DJ    HIRO")).toBe("DJ HIRO");
  });

  it("デフォルトで19文字に切り詰められる", () => {
    const longName = "SPACE BBQ FESTIVAL 2026 SUMMER EDITION";
    const result = sanitizeStatementDescriptorSuffix(longName);
    expect(result!.length).toBeLessThanOrEqual(19);
    expect(result).toBe("SPACE BBQ FESTIVAL");
  });

  it("切り詰め後の末尾空白はトリムされる", () => {
    // 19文字目がちょうど空白になるケース
    const result = sanitizeStatementDescriptorSuffix("ABCDEFGHIJKLMNOPQR STUVWXYZ", 19);
    expect(result).not.toMatch(/\s$/);
  });

  it("maxLenを指定すればその文字数に切り詰められる", () => {
    expect(sanitizeStatementDescriptorSuffix("DJ HIRO TOKYO", 7)).toBe("DJ HIRO");
  });
});

describe("TC-SD-02: resolveStatementDescriptorSource", () => {
  it("isEntrance=true の場合、recipient_name_contextに関わらずorganizerNameを返す（MoRがオーガナイザーのため）", () => {
    const result = resolveStatementDescriptorSource({
      isEntrance: true,
      recipientNameContext: "artist",
      artistName: "DJ HIRO",
      organizerName: "運営チーム",
    });
    expect(result).toBe("運営チーム");
  });

  it("isEntrance=true でorganizerNameが無い場合、recipientDisplayNameにフォールバックする", () => {
    const result = resolveStatementDescriptorSource({
      isEntrance: true,
      recipientNameContext: "organizer",
      organizerName: null,
      recipientDisplayName: "山田太郎",
    });
    expect(result).toBe("山田太郎");
  });

  it("recipientNameContext='artist' の場合、artistNameを優先する", () => {
    const result = resolveStatementDescriptorSource({
      isEntrance: false,
      recipientNameContext: "artist",
      artistName: "DJ HIRO",
      recipientDisplayName: "山田太郎",
    });
    expect(result).toBe("DJ HIRO");
  });

  it("recipientNameContext='artist' でartistNameが無い場合、displayNameにフォールバックする", () => {
    const result = resolveStatementDescriptorSource({
      isEntrance: false,
      recipientNameContext: "artist",
      artistName: null,
      recipientDisplayName: "山田太郎",
    });
    expect(result).toBe("山田太郎");
  });

  it("recipientNameContext='organizer' の場合、organizerNameを使う（イベント名は使わない。英語表記と同じ情報量に揃える）", () => {
    const result = resolveStatementDescriptorSource({
      isEntrance: false,
      recipientNameContext: "organizer",
      organizerName: "SPACE BBQ運営",
      recipientDisplayName: "山田太郎",
    });
    expect(result).toBe("SPACE BBQ運営");
  });

  it("organizer文脈でorganizerNameが無い場合、recipientDisplayNameにフォールバックする", () => {
    const result = resolveStatementDescriptorSource({
      isEntrance: false,
      recipientNameContext: "organizer",
      organizerName: null,
      recipientDisplayName: "山田太郎",
    });
    expect(result).toBe("山田太郎");
  });

  it("organizer文脈でorganizerName・displayNameが両方無い場合、nullを返す（suffix自体を省略する）", () => {
    const result = resolveStatementDescriptorSource({
      isEntrance: false,
      recipientNameContext: "organizer",
    });
    expect(result).toBeNull();
  });

  it("全てのフォールバックが無い場合、nullを返す（DIRECT CHEERSのような固定文字は使わない）", () => {
    const result = resolveStatementDescriptorSource({
      isEntrance: false,
      recipientNameContext: "artist",
    });
    expect(result).toBeNull();
  });
});

describe("TC-SD-03: buildStatementDescriptorSuffix（解決+サニタイズの統合）", () => {
  it("演者名義のチア決済 → 演者名をサニタイズしたsuffixを返す", () => {
    const result = buildStatementDescriptorSuffix({
      isEntrance: false,
      recipientNameContext: "artist",
      artistName: "DJ HIRO",
    });
    expect(result).toBe("DJ HIRO");
  });

  it("主催者名義のチア決済 → 主催者名をサニタイズしたsuffixを返す（イベント名は使わない）", () => {
    const result = buildStatementDescriptorSuffix({
      isEntrance: false,
      recipientNameContext: "organizer",
      organizerName: "SPACE BBQ",
    });
    expect(result).toBe("SPACE BBQ");
  });

  it("入場券 → 宛先名義に関わらず主催者名をsuffixにする（イベント名は使わない）", () => {
    const result = buildStatementDescriptorSuffix({
      isEntrance: true,
      recipientNameContext: "artist", // 入場券では無視される
      artistName: "DJ HIRO",
      organizerName: "SPACE BBQ",
    });
    expect(result).toBe("SPACE BBQ");
  });

  it("名前が漢字のみでASCII化できない場合、undefinedを返す（suffix省略）", () => {
    const result = buildStatementDescriptorSuffix({
      isEntrance: false,
      recipientNameContext: "artist",
      artistName: "宇宙ヒロ",
      recipientDisplayName: "宇宙ヒロ",
    });
    expect(result).toBeUndefined();
  });

  it("名前自体が無い場合（organizer文脈でデータ無し）、undefinedを返す", () => {
    const result = buildStatementDescriptorSuffix({
      isEntrance: false,
      recipientNameContext: "organizer",
    });
    expect(result).toBeUndefined();
  });

  it("端数ズレデモ用の端数処理（19文字制限）が正しく機能する", () => {
    const result = buildStatementDescriptorSuffix({
      isEntrance: false,
      recipientNameContext: "organizer",
      organizerName: "SPACE BBQ FESTIVAL ORGANIZING COMMITTEE",
    });
    expect(result!.length).toBeLessThanOrEqual(19);
  });
});

describe("TC-SD-04: PLATFORM_PREFIX（account-level prefix の固定。カスタマイズ不可）", () => {
  it("PLATFORM_PREFIXは常に固定文字列 'DC' である", () => {
    expect(PLATFORM_PREFIX).toBe("DC");
  });
});

describe("TC-SD-05: combineDescriptorPreview（prefix+suffix結合のシミュレーション）", () => {
  it("合計が上限以内なら単純に結合される", () => {
    const { combined, truncated } = combineDescriptorPreview("DC-SPACEBBQ", "DJ HIRO", 22);
    expect(combined).toBe("DC-SPACEBBQ DJ HIRO");
    expect(truncated).toBe(false);
  });

  it("suffixが無い場合はprefixのみ返す", () => {
    const { combined, truncated } = combineDescriptorPreview("DC-SPACEBBQ", undefined, 22);
    expect(combined).toBe("DC-SPACEBBQ");
    expect(truncated).toBe(false);
  });

  it("合計が上限を超える場合、prefix側が切り詰められ、suffixは満額残る（Stripeの実際の挙動に合わせる）", () => {
    const { combined, truncated } = combineDescriptorPreview(
      "DC-VERYLONGORGANIZERNAME", "DJ HIRO", 22,
    );
    expect(truncated).toBe(true);
    expect(combined.endsWith("DJ HIRO")).toBe(true);
    expect(combined.length).toBeLessThanOrEqual(22);
  });

  it("suffix自体がtotalMaxを超える極端な場合でも、suffixを優先してtotalMaxに収める", () => {
    const { combined } = combineDescriptorPreview("DC-X", "A".repeat(30), 22);
    expect(combined.length).toBeLessThanOrEqual(22);
  });

  it("単語の途中で切れる位置の場合、直前の空白まで戻る（'DC-SPACE MI'のような断片を残さない）", () => {
    const { combined } = combineDescriptorPreview("DC-SPACE MIND", "DJ HIROYUKI", 22);
    expect(combined).toBe("DC-SPACE DJ HIROYUKI");
    expect(combined).not.toMatch(/\bM\b|\bMI\b/);
  });

  it("切り詰め位置がちょうど単語の境界なら、完全な単語をそのまま残す（不要な巻き戻しをしない）", () => {
    const { combined } = combineDescriptorPreview("DC-SPACE MIND ORGANIZATION", "DJ HIROX", 22);
    expect(combined).toBe("DC-SPACE MIND DJ HIROX");
  });

  it("空白が無く戻る先が無い場合は、素直に切り詰める（何も表示しないよりは良い）", () => {
    const { combined } = combineDescriptorPreview("DC-VERYLONGORGANIZERNAME", "DJ HIRO", 22);
    expect(combined.endsWith("DJ HIRO")).toBe(true);
    expect(combined.length).toBeLessThanOrEqual(22);
  });
});

/**
 * TC-SD-06: components/statement-descriptor-preview.tsx が画面に表示する文字列と、
 * 実際にStripeへ送るsuffix（lib/statement-descriptor.ts の buildStatementDescriptorSuffixes
 * が pay/cheers・entrance-payment 経由でStripeに渡す値）が完全に一致することを保証する。
 *
 * プレビュー側は sanitizeStatementDescriptorSuffix(name, 19) /
 * sanitizeStatementDescriptorSuffixKanji(name, 17) を直接呼んでいる
 * （components/statement-descriptor-preview.tsx 参照）。本番側は同じ名前を
 * buildStatementDescriptorSuffixes に通して同じ関数・同じ文字数制限で
 * suffix/suffixKana/suffixKanjiを作る。どちらかの maxLen だけがズレる
 * （今回発生した不整合のような）回帰を検出するためのテスト。
 *
 * 注意: 先頭の "DC" 部分（account-level prefix）はオンボーディング時に登録した
 * 屋号から作られる別の値であり、このテスト・プレビューが模している裸の "DC" とは
 * 一致しない場合がある（屋号を登録していない場合のみ完全一致）。ここで保証するのは
 * 「suffix（主催者名/演者名の部分）が画面表示と送信内容で一致する」ことのみ。
 */
describe("TC-SD-06: プレビュー表示と本番送信値（suffix）の整合性", () => {
  function previewSuffixes(name: string) {
    return {
      ascii: sanitizeStatementDescriptorSuffix(name, 19),
      kanji: sanitizeStatementDescriptorSuffixKanji(name, 17),
    };
  }

  it("演者名（artist_name）: プレビューのsuffixと、本番送信されるsuffix/suffixKanjiが一致する", () => {
    const name = "DJ HIRO";
    const preview = previewSuffixes(name);
    const prod = buildStatementDescriptorSuffixes({
      isEntrance: false,
      recipientNameContext: "artist",
      artistName: name,
    });
    expect(preview.ascii).toBe(prod.suffix ?? null);
    expect(preview.kanji).toBe(prod.suffixKanji ?? null);
  });

  it("主催者名（organizer_name）: プレビューのsuffixと、本番送信されるsuffix/suffixKanjiが一致する", () => {
    const name = "SPACE BBQ";
    const preview = previewSuffixes(name);
    const prod = buildStatementDescriptorSuffixes({
      isEntrance: false,
      recipientNameContext: "organizer",
      organizerName: name,
    });
    expect(preview.ascii).toBe(prod.suffix ?? null);
    expect(preview.kanji).toBe(prod.suffixKanji ?? null);
  });

  it("入場券（主催者名義）: プレビューのsuffixと、本番送信されるsuffix/suffixKanjiが一致する", () => {
    const name = "宇宙運営委員会"; // 漢字名（ASCII化不能ケースも含めて検証）
    const preview = previewSuffixes(name);
    const prod = buildStatementDescriptorSuffixes({
      isEntrance: true,
      recipientNameContext: "organizer",
      organizerName: name,
    });
    expect(preview.ascii).toBe(prod.suffix ?? null);
    expect(preview.kanji).toBe(prod.suffixKanji ?? null);
  });

  it("長い名前で切り詰めが発生するケースでも、プレビューと本番のsuffixが一致する", () => {
    const name = "SPACE BBQ FESTIVAL ORGANIZING COMMITTEE 2026";
    const preview = previewSuffixes(name);
    const prod = buildStatementDescriptorSuffixes({
      isEntrance: false,
      recipientNameContext: "artist",
      artistName: name,
    });
    expect(preview.ascii).toBe(prod.suffix ?? null);
    expect(preview.kanji).toBe(prod.suffixKanji ?? null);
  });
});
