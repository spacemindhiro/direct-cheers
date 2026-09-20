import { Resend } from "resend";
import { claimTermsNoticeHtml } from "@/lib/purchase-claim";

type PurchaseReceiptParams = {
  to: string;
  amount: number;
  recipientName: string | null;
  eventTitle: string | null;
  transactionId: string;
  productType?: string | null;
  ticketId?: string | null;
  // 決済後アカウント作成リンク（/auth/claim/<token>）。呼び出し元が
  // lib/purchase-claim.ts の issuePurchaseClaimUrl で発行して渡す。
  // メールの所有を証明できるのはこのリンクを踏んだ人だけなので、
  // 以前のように /auth/passkey-setup?email=… と平文メールを載せてはならない。
  claimUrl: string;
};

export async function sendPurchaseReceipt(params: PurchaseReceiptParams): Promise<void> {
  const { to, amount, recipientName, eventTitle, transactionId, productType, claimUrl } = params;
  const resend = new Resend(process.env.RESEND_API_KEY);

  if (productType === "entrance") {
    const eventLine = eventTitle
      ? `<p style="color:#cbd5e1;font-size:14px;font-weight:700;margin:0 0 8px">${eventTitle}</p>`
      : "";

    await resend.emails.send({
      from: "Direct Cheers <noreply@direct-cheers.com>",
      to,
      subject: "【Direct Cheers】チケット購入が完了しました",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#f1f5f9;border-radius:16px">
          <p style="color:#818cf8;font-size:10px;font-weight:900;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 8px">Direct Cheers</p>
          <p style="font-size:22px;font-weight:900;margin:0 0 20px">🎟️ チケット購入が完了しました</p>

          <div style="background:#1e293b;border-radius:12px;padding:20px;margin-bottom:20px">
            ${eventLine}
            <p style="color:#94a3b8;font-size:12px;margin:0 0 4px">お支払い金額</p>
            <p style="font-size:32px;font-weight:900;margin:0;color:#fff">¥${amount.toLocaleString("ja-JP")}</p>
          </div>

          <p style="color:#64748b;font-size:13px;line-height:1.8;margin:0 0 20px">
            このたびは Direct Cheers のチケットをご購入いただきありがとうございます。<br>
            下のボタンからチケットをご確認ください。<br>
            はじめての方はこのボタンからアカウントを作成できます（顔認証・指紋認証の登録は1タップ）。
          </p>

          <a href="${claimUrl}"
            style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;text-decoration:none;border-radius:12px;font-weight:900;font-size:14px">
            チケットを確認する
          </a>
          ${claimTermsNoticeHtml()}

          <p style="color:#334155;font-size:11px;margin:24px 0 0">
            取引ID：${transactionId}<br>
            ボタンのリンクは30日間・1回のみ有効です。<br>
            このメールに心当たりがない場合はお手数ですがご連絡ください。
          </p>
        </div>
      `,
    });
    return;
  }

  // チアカード購入メール
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
          下のボタンからコレクション画面でチアーズカードを確認できます。<br>
          はじめての方はこのボタンからアカウントを作成できます（顔認証・指紋認証の登録は1タップ）。
        </p>

        <a href="${claimUrl}"
          style="display:inline-block;padding:14px 28px;background:#ec4899;color:#fff;text-decoration:none;border-radius:12px;font-weight:900;font-size:14px">
          コレクションを見る
        </a>
        ${claimTermsNoticeHtml()}

        <p style="color:#334155;font-size:11px;margin:24px 0 0">
          取引ID：${transactionId}<br>
          ボタンのリンクは30日間・1回のみ有効です。<br>
          このメールに心当たりがない場合はお手数ですがご連絡ください。
        </p>
      </div>
    `,
  });
}
