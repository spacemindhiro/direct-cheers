/**
 * TC-CHEERY-UI: チアリー(AI) の画面まわりの決まり（lib/cheery/screen.ts・lib/cheery/stream.ts）
 *
 * - 今いる画面の種類：URL から決まった値だけを AI に渡す（lib/ai/prompt.ts の SCREEN_LABELS に無い値は出さない）
 * - 浮きボタン：入場スキャナ・タッチ決済・会場ディスプレイ・スキャナ用QR では出さない
 * - 応答：本文と「行き先ボタン・動画カードの材料」を区切り記号で分ける。〔参照:…〕は途中まででも本文に出さない
 */
import { describe, it, expect } from "vitest";
import { screenOf, showFloatingButton } from "@/lib/cheery/screen";
import { splitAnswer, stripRefs, trimRewrite, REFS_SEPARATOR, RESET_MARK } from "@/lib/cheery/stream";
import { SCREEN_LABELS } from "@/lib/ai/prompt";

describe("TC-CHEERY-UI: 画面の種類", () => {
  const cases: [string, string | undefined][] = [
    ["/dashboard", "home"],
    ["/ja/dashboard", "home"],
    ["/dashboard/help", "help"],
    ["/dashboard/events", "events"],
    ["/dashboard/events/create", "event_create"],
    ["/dashboard/events/abc", "event_detail"],
    ["/dashboard/events/abc/qr/create", "qr_create"],
    ["/dashboard/events/abc/qr/q1", "qr_detail"],
    ["/dashboard/events/abc/evidence", "evidence"],
    ["/dashboard/payout", "payout"],
    ["/dashboard/income", "income"],
    ["/dashboard/profile", "profile"],
    ["/dashboard/account", "account"],
    ["/dashboard/collection", "collection"],
    ["/dashboard/invitations", "invitations"],
    ["/tickets", "tickets"],
    ["/dashboard/events/abc/settlement", undefined],
    ["/dashboard/messages", undefined],
  ];
  for (const [path, want] of cases) {
    it(`${path} → ${want ?? "（渡さない）"}`, () => expect(screenOf(path)).toBe(want));
  }
  it("出す値はすべて SCREEN_LABELS にある", () => {
    for (const [, want] of cases) if (want) expect(`${want}:${want in SCREEN_LABELS}`).toBe(`${want}:true`);
  });
});

describe("TC-CHEERY-UI: 浮きボタンを出す画面", () => {
  for (const [path, want] of [
    ["/dashboard", true],
    ["/dashboard/events/abc", true],
    ["/dashboard/events/abc/checkin", false],
    ["/dashboard/events/abc/checkin/touch-pay", false],
    ["/dashboard/events/abc/display", false],
    ["/dashboard/scanner-qr", false],
    ["/ja/dashboard/scanner-qr", false],
  ] as const) {
    it(`${path} → ${want ? "出す" : "出さない"}`, () => expect(showFloatingButton(path)).toBe(want));
  }
});

describe("TC-CHEERY-UI: 応答の切り分け", () => {
  it("区切りの前が本文、後ろがカードの材料", () => {
    const refs = [{ id: "artist.payout", title: "出金" }];
    expect(splitAnswer(`出金管理から申請します。\n〔参照:artist.payout〕${REFS_SEPARATOR}${JSON.stringify({ refs })}`)).toEqual({ text: "出金管理から申請します。", refs, cards: [] });
  });

  it("確認カード（cards）も末尾の材料から取り出す", () => {
    const cards = [{ kind: "venue_pin", card_id: "c1", name: "特設会場", center: null }];
    expect(splitAnswer(`地図を出しました。${REFS_SEPARATOR}${JSON.stringify({ refs: [], cards })}`)).toEqual({ text: "地図を出しました。", refs: [], cards });
  });

  it("流れてくる途中：区切りが来るまでカードは null。閉じていない〔参照… は隠す", () => {
    expect(splitAnswer("出金管理から申請します。\n〔参")).toEqual({ text: "出金管理から申請します。", refs: null, cards: null });
    expect(splitAnswer("出金管理から申請します。\n〔参照:artist.pa")).toEqual({ text: "出金管理から申請します。", refs: null, cards: null });
    expect(splitAnswer("出金管理から申請します。\n〔")).toEqual({ text: "出金管理から申請します。", refs: null, cards: null });
  });

  it("消す印より前（ツールを呼ぶ前の前置き）は出さない。流れてくる途中も同じ", () => {
    expect(splitAnswer(`出演者を教えてください${RESET_MARK}`)).toEqual({ text: "", refs: null, cards: null });
    expect(splitAnswer(`出演者を教えてください${RESET_MARK}出演者を`)).toEqual({ text: "出演者を", refs: null, cards: null });
    expect(splitAnswer(`前置き${RESET_MARK}確認${RESET_MARK}出演者を教えてください${REFS_SEPARATOR}{"refs":[],"cards":[]}`))
      .toEqual({ text: "出演者を教えてください", refs: [], cards: [] });
  });

  it("〔参照 以外の〔〕は本文として残す", () => {
    expect(stripRefs("〔注意〕カード番号は入力しないでください")).toBe("〔注意〕カード番号は入力しないでください");
  });

  it("カードの材料が途中までしか届いていなければ null（壊れた JSON で落ちない）", () => {
    expect(splitAnswer(`本文${REFS_SEPARATOR}{"refs":[{"id"`)).toEqual({ text: "本文", refs: null, cards: null });
  });
});

describe("TC-CHEERY-UI: 書き直しの付け足しを落とす（trimRewrite）", () => {
  it("書き終えた答えを改行のあとに書き直していたら、2回目の行から後ろを落とす（実際に出た答え）", () => {
    const a = "会場は「X」で見つかりました。2026年12月20日（日）19:00〜22:00で合っていますか。あと一つだけ、出演者のお名前を教えてください。\n会場は「X」で見つかりました。2026年12月20日（日）19:00〜22:00で進めます。\n\nあと一つだけ、出演者のお名前を教えてくださいね。 \n〔参照:organizer.create-event〕";
    expect(trimRewrite(a)).toBe("会場は「X」で見つかりました。2026年12月20日（日）19:00〜22:00で合っていますか。あと一つだけ、出演者のお名前を教えてください。\n〔参照:organizer.create-event〕");
  });

  it("2回目の行の途中から重なっていても、その行から落とす", () => {
    const a = "出演者はどなたですか？ いなければ「出演者なし」と教えてくださいね。\n会場「X」は会場マスタにあります。出演者はどなたですか？ いなければ「出演者なし」と教えてくださいね。";
    expect(trimRewrite(a)).toBe("出演者はどなたですか？ いなければ「出演者なし」と教えてくださいね。");
  });

  it("同じ行の中で重なった文は、その文だけ落とす", () => {
    expect(trimRewrite("出演者はいますか？いる場合は名前を教えてください。いる場合は名前を教えてください。"))
      .toBe("出演者はいますか？いる場合は名前を教えてください。");
  });

  it("重なりが無い・短い文（8文字未満）の重なりはそのまま", () => {
    const plain = "QRの確認カードを出しました。\n\n作成後、QRを掲示できるのは会場内だけです。〔参照:organizer.create-qr〕";
    expect(trimRewrite(plain)).toBe(plain);
    expect(trimRewrite("はい。\nはい。")).toBe("はい。\nはい。");
  });
});
