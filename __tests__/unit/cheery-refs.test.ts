/**
 * TC-CHEERY-REFS: 答えの「行き先ボタン」「動画カード」の材料（lib/ai/refs.ts）
 *
 * - AI が答えの最後に書いた〔参照:ID,ID〕から、本人のロールで見てよい項目だけをカードにする
 * - 上位ロール向けの項目・存在しないID・重複は捨てる。最大3つ
 * - ヘルプに載っている項目だけ「ヘルプで見る」、goto がある項目だけ「画面を開く」、動画がある項目だけ動画カード
 * - 本文から〔参照:…〕を取り除く
 */
import { describe, it, expect } from "vitest";
import { extractRefs, stripRefs, MAX_REFS } from "@/lib/ai/refs";
import { KNOWLEDGE_ITEMS } from "@/lib/knowledge";
import { TUTORIAL_VIDEO_IDS } from "@/lib/tutorial-videos";

const ids = (text: string, role: string) => extractRefs(text, role).map((r) => r.id);

describe("TC-CHEERY-REFS", () => {
  it("本人のロールで見てよい項目だけ。上位ロール向け・存在しないID・重複は捨てる", () => {
    const text = "答えです。\n〔参照:user.my-tickets, organizer.create-qr, nope.x, user.my-tickets〕";
    expect(ids(text, "user")).toEqual(["user.my-tickets"]);
    expect(ids(text, "organizer")).toEqual(["user.my-tickets", "organizer.create-qr"]);
  });

  it(`最大${MAX_REFS}つ。区切りは「,」「、」空白のどれでもよい。全角コロンも受け付ける`, () => {
    expect(ids("〔参照：user.login、user.account user.collection,user.my-tickets〕", "user")).toEqual(["user.login", "user.account", "user.collection"]);
  });

  it("参照が無ければ空", () => {
    expect(extractRefs("参照の無い答え", "organizer")).toEqual([]);
  });

  it("カードの材料：ヘルプの場所・行き先・動画は知識集から作る（AI の書いた文字は使わない）", () => {
    const item = KNOWLEDGE_ITEMS.find((i) => i.id === "organizer.create-qr")!;
    const video = item.kind === "section" && item.help?.video ? TUTORIAL_VIDEO_IDS[item.help.video] : undefined;
    expect(video).toBeTypeOf("string");
    expect(extractRefs("〔参照:organizer.create-qr〕", "organizer")).toEqual([{
      id: "organizer.create-qr",
      title: "QRを作成する（スタンダード／メッセージ）",
      help: { href: "/dashboard/help?item=organizer.create-qr", label: "ヘルプ：オーガナイザー＞準備・機能 ⑧" },
      goto: { href: "/dashboard/events", label: "イベント一覧を開く" },
      video: { youtubeId: video, label: "動画で見る：QRを作成する（スタンダード／メッセージ）" },
    }]);
  });

  it("ヘルプに載っていない項目はヘルプのボタンを付けない", () => {
    const r = extractRefs("〔参照:rules.hold-period〕", "artist");
    expect(r).toEqual([{ id: "rules.hold-period", title: "売上がすぐ出金できない理由（留保期間）" }]);
  });

  it("本文から〔参照:…〕を取り除く", () => {
    expect(stripRefs("出金管理から申請します。\n〔参照:artist.payout〕")).toBe("出金管理から申請します。");
  });
});
