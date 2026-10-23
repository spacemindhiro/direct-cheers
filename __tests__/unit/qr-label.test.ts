/**
 * TC-QR-LABEL: QR のラベル（お客様に見える唯一の名前）の候補・注意・本人の言葉かの判定（lib/qr/label.ts）
 * 誰に何を払ったか分からないラベルは、身に覚えのない支払いとして異議（チャージバック）を出されやすい。
 */
import { describe, it, expect } from "vitest";
import { labelFromUser, labelSuggestions, labelWarning } from "@/lib/qr/label";

describe("TC-QR-LABEL", () => {
  it("候補は誰に・何を払うものか分かる形（宛先が決まっていなければチアの候補は出さない）", () => {
    expect([
      labelSuggestions("standard", null, "night-streamer"),
      labelSuggestions("message", null, "night-streamer"),
      labelSuggestions("standard", null, null),
      labelSuggestions("entrance", "A", null),
      labelSuggestions("entrance", "B", "x"),
      labelSuggestions("entrance", "C", null),
    ]).toEqual([["night-streamer へのチア"], ["night-streamer へのメッセージチア"], [], ["前売入場券"], ["前売入場券"], ["当日入場券"]]);
  });

  it("注意：チアに宛先の名前が無い・入場券に入場の言葉が無い。分かるものには出さない", () => {
    expect([
      labelWarning("standard", "DJブース", "night-streamer"),
      labelWarning("standard", "night-streamer へのチア", "night-streamer"),
      labelWarning("message", "応援", "Aさん"),
      labelWarning("entrance", "前売", null),
      labelWarning("entrance", "当日券", null),
      labelWarning("entrance", "Entry Ticket", null),
      labelWarning("standard", "", "x"),
    ]).toEqual([
      "誰へのチアか分かりません（宛先の「night-streamer」が入っていません）",
      null,
      "誰へのチアか分かりません（宛先の「Aさん」が入っていません）",
      "入場のための支払いだと分かる言葉（入場・券・チケットなど）が入っていません",
      null,
      null,
      null,
    ]);
  });

  it("本人の言葉か：一字一句そのまま含まれているときだけ（全角半角・付け足し・空は不可）", () => {
    const said = ["ラベルは「DJブース」で"];
    expect([
      labelFromUser(said, "DJブース"),
      labelFromUser(said, " DJブース "),
      labelFromUser(said, "ＤＪブース"),
      labelFromUser(said, "DJブース用"),
      labelFromUser(said, "  "),
      labelFromUser(undefined, "DJブース"),
    ]).toEqual([true, true, false, false, false, false]);
  });
});
