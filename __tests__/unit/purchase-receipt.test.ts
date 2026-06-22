/**
 * TC-RECEIPT: lib/email/purchase-receipt.ts のユニットテスト
 *
 * 【仕様マトリクス】受領メールの宛先表記（"○○ への Cheers を送りました"・件名）は、
 * recipientNameに渡された動的な文字列と完全一致しなければならない
 * （イベント名や固定文字列で汚染されていないこと、HTMLエスケープ等で値が
 * 変質していないことを直接検証する）。
 *
 * resendをモックし、実際にメールプロバイダへ送られるパラメータ（subject/html）を
 * キャプチャして検証する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn().mockResolvedValue({ data: { id: "email_test" }, error: null });

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { sendPurchaseReceipt } from "@/lib/email/purchase-receipt";

beforeEach(() => {
  sendMock.mockClear();
});

describe("TC-RECEIPT-01: チアカード購入メール（organizer/artist名義の完全一致）", () => {
  it("recipientName='SPACE BBQ運営委員会'（organizer名義）→ 件名・本文に完全一致で反映される", async () => {
    const recipientName = "SPACE BBQ運営委員会";
    const eventTitle = "SPACE BBQ FESTIVAL 2026"; // イベント名は宛先表記に混ざってはならない

    await sendPurchaseReceipt({
      to: "fan@test.local",
      amount: 1000,
      recipientName,
      eventTitle,
      transactionId: "tx_receipt_organizer",
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const params = sendMock.mock.calls[0][0];
    expect(params.subject).toBe(`【Direct Cheers】${recipientName}へのCheers！ありがとうございました`);
    expect(params.html).toContain(`<strong>${recipientName}</strong> への`);
    // イベント名は別行（eventLine）として出ることはあっても、宛先表記そのものに混ざってはいけない
    expect(params.html).not.toContain(`${eventTitle}</strong>`);
    expect(params.html).not.toContain(`<strong>${eventTitle}`);
  });

  it("recipientName='DJ HIRO'（artist名義）→ organizer名義の文字列が一切混入しない", async () => {
    const recipientName = "DJ HIRO";
    const unrelatedOrganizerName = "SPACE BBQ運営委員会";

    await sendPurchaseReceipt({
      to: "fan2@test.local",
      amount: 2000,
      recipientName,
      eventTitle: null,
      transactionId: "tx_receipt_artist",
    });

    const params = sendMock.mock.calls[0][0];
    expect(params.subject).toBe(`【Direct Cheers】${recipientName}へのCheers！ありがとうございました`);
    expect(params.html).toContain(`<strong>${recipientName}</strong> への`);
    expect(params.html).not.toContain(unrelatedOrganizerName);
    expect(params.subject).not.toContain(unrelatedOrganizerName);
  });

  it("recipientNameがnullの場合のみ、固定文字列「アーティスト」にフォールバックする", async () => {
    await sendPurchaseReceipt({
      to: "fan3@test.local",
      amount: 500,
      recipientName: null,
      eventTitle: null,
      transactionId: "tx_receipt_null",
    });

    const params = sendMock.mock.calls[0][0];
    expect(params.subject).toBe("【Direct Cheers】アーティストへのCheers！ありがとうございました");
    // recipientNameが無い場合、宛先行自体が出ない（"<strong>null</strong>"のような文字列化バグが無いこと）
    expect(params.html).not.toContain("<strong>null</strong>");
    expect(params.html).not.toContain("undefined");
  });
});

describe("TC-RECEIPT-02: 入場券購入メール（イベント名のみ、宛先名義は出さない）", () => {
  it("productType='entrance' の場合、recipientNameは使われずeventTitleのみ反映される", async () => {
    const eventTitle = "SPACE BBQ FESTIVAL 2026";
    await sendPurchaseReceipt({
      to: "fan4@test.local",
      amount: 3000,
      recipientName: "SPACE BBQ運営委員会", // 入場券では使われないはず
      eventTitle,
      transactionId: "tx_receipt_entrance",
      productType: "entrance",
    });

    const params = sendMock.mock.calls[0][0];
    expect(params.subject).toBe("【Direct Cheers】チケット購入が完了しました");
    expect(params.html).toContain(`>${eventTitle}<`);
    expect(params.html).not.toContain("SPACE BBQ運営委員会");
  });
});
