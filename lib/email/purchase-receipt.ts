import { Resend } from "resend";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

type PurchaseReceiptParams = {
  to: string;
  amount: number;
  recipientName: string | null;
  eventTitle: string | null;
  transactionId: string;
};

export async function sendPurchaseReceipt(params: PurchaseReceiptParams): Promise<void> {
  const { to, amount, recipientName, eventTitle, transactionId } = params;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const collectionUrl = `${SITE_URL}/dashboard/collection`;

  const toLine = recipientName ? `<strong>${recipientName}</strong> への` : "";
  const eventLine = eventTitle
    ? `<p style="color:#64748b;font-size:13px;margin:0">イベント：${eventTitle}</p>`
    : "";

  await resend.emails.send({
    from: "Direct Cheers <noreply@direct-cheers.com>",
    to,
    subject: `【Direct Cheers】${recipientName ?? "アーティスト"}へのCheers！ありがとうございました`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#f1f5f9;border-radius:16px">
        <p style="color:#ec4899;font-size:28px;font-weight:900;margin:0 0 4px">♥ Cheers！</p>
        <p style="font-size:15px;font-weight:700;margin:0 0 20px">ありがとうございました！</p>

        <div style="background:#1e293b;border-radius:12px;padding:20px;margin-bottom:20px">
          <p style="color:#94a3b8;font-size:12px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.08em">お支払い金額</p>
          <p style="font-size:32px;font-weight:900;margin:0;color:#fff">¥${amount.toLocaleString("ja-JP")}</p>
          <p style="color:#94a3b8;font-size:12px;margin:8px 0 0">${toLine}Cheers を送りました</p>
          ${eventLine}
        </div>

        <p style="color:#64748b;font-size:13px;line-height:1.8;margin:0 0 20px">
          このたびは Direct Cheers をご利用いただきありがとうございます。<br>
          あなたのCheersはアーティストに届いています。<br>
          決済完了後、コレクション画面でチアーズカードを確認できます。
        </p>

        <a href="${collectionUrl}"
          style="display:inline-block;padding:14px 28px;background:#ec4899;color:#fff;text-decoration:none;border-radius:12px;font-weight:900;font-size:14px">
          コレクションを見る
        </a>

        <p style="color:#334155;font-size:11px;margin:24px 0 0">
          取引ID：${transactionId}<br>
          このメールに心当たりがない場合はお手数ですがご連絡ください。
        </p>
      </div>
    `,
  });
}
